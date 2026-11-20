import httpStatus from 'http-status';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import prisma from '../client';
import ApiError from '@utils/ApiError';
import {listArgs, toListResult} from '../utils/list';
import quotationValidation from '../validations/quotation.validation';
import accountService from './account.service';
import billService from './bill.service';
import {ShopScope} from './shopProduct.service';

type CreateQuotation = z.infer<typeof quotationValidation.createQuotationSchema>;
type UpdateQuotation = z.infer<typeof quotationValidation.updateQuotationSchema>;
type QuotationList = z.infer<typeof quotationValidation.listSchema>;
type Tx = Prisma.TransactionClient;

const round2 = (v: number) => Math.round(v * 100) / 100;

const INCLUDE = {
    items: {
        orderBy: {id: 'asc' as const},
        include: {
            product: {select: {id: true, name: true, sku: true, images: {take: 1, select: {url: true}}}},
            variant: {select: {id: true, variantSku: true, variantName: true, finish: true}},
        },
    },
    salesBill: {select: {id: true, billNumber: true, totalAmount: true}},
    shop: {
        select: {
            name: true,
            gstin: true,
            address: true,
            phone: true,
            email: true,
            branch: {select: {name: true, city: true, state: true}},
            company: {select: {name: true, logo: true}},
        },
    },
} satisfies Prisma.QuotationInclude;

/** Financial year of a date, e.g. 26-27 for Apr 2026 - Mar 2027 */
const fy = (d = new Date()) => {
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};

/*
 * Quotations of a branch: DRAFT -> SENT -> ACCEPTED -> CONVERTED (a sales
 * bill made from it), or REJECTED. Every amount is recomputed here:
 *   line taxable = qty x unit price - line discount
 *   line GST     = taxable x rate        line total = taxable + GST
 *   total        = sum of line totals + delivery / installation charges
 */
class QuotationService {
    private async totals(tx: Tx | typeof prisma, scope: ShopScope, data: Pick<CreateQuotation, 'items' | 'extraCharges'>) {
        // Catalog lines must be products of this branch
        const productIds = [...new Set(data.items.map((i) => i.productId).filter(Boolean) as string[])];
        const variantIds = [...new Set(data.items.map((i) => i.variantId).filter(Boolean) as string[])];
        const [products, variants] = await Promise.all([
            productIds.length
                ? tx.product.findMany({
                      where: {id: {in: productIds}, shopId: scope.shopId, companyId: scope.companyId, deletedAt: null},
                      select: {id: true, hsnCode: true},
                  })
                : [],
            variantIds.length
                ? tx.productVariant.findMany({where: {id: {in: variantIds}}, select: {id: true, productId: true}})
                : [],
        ]);
        const productOf = new Map(products.map((p) => [p.id, p]));
        const variantOf = new Map(variants.map((v) => [v.id, v]));
        let subtotal = 0;
        let discount = 0;
        let taxAmount = 0;
        const items = data.items.map((i, idx) => {
            if (i.productId && !productOf.has(i.productId)) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Item ${idx + 1}: product not found in this branch`, [
                    {field: `items.${idx}.productId`, message: 'Product not found in this branch'},
                ]);
            }
            if (i.variantId && variantOf.get(i.variantId)?.productId !== i.productId) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Item ${idx + 1}: variant does not belong to the product`, [
                    {field: `items.${idx}.variantId`, message: 'Variant does not belong to the product'},
                ]);
            }
            const gross = round2(i.quantity * i.unitPrice);
            const taxable = round2(gross - i.discount);
            const tax = round2((taxable * i.taxRate) / 100);
            subtotal += gross;
            discount += i.discount;
            taxAmount += tax;
            return {
                productId: i.productId ?? null,
                variantId: i.variantId ?? null,
                description: i.description,
                hsnCode: i.hsnCode ?? (i.productId ? productOf.get(i.productId)?.hsnCode : null) ?? null,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                discount: i.discount,
                taxRate: i.taxRate,
                totalPrice: round2(taxable + tax),
            };
        });
        subtotal = round2(subtotal);
        discount = round2(discount);
        taxAmount = round2(taxAmount);
        const extraCharges = round2(data.extraCharges ?? 0);
        return {
            items,
            totals: {
                subtotal,
                discount,
                taxAmount,
                extraCharges,
                totalAmount: round2(subtotal - discount + taxAmount + extraCharges),
            },
        };
    }

    private where(scope: ShopScope, id?: string): Prisma.QuotationWhereInput {
        return {...(id ? {id} : {}), shopId: scope.shopId, companyId: scope.companyId};
    }

    public async list(scope: ShopScope, query: QuotationList) {
        const where: Prisma.QuotationWhereInput = {
            ...this.where(scope),
            status: query.status,
            ...(query.search
                ? {
                      OR: [
                          {quotationNumber: {contains: query.search, mode: 'insensitive'}},
                          {customerName: {contains: query.search, mode: 'insensitive'}},
                          {customerPhone: {contains: query.search}},
                      ],
                  }
                : {}),
        };
        const [items, total, groups] = await prisma.$transaction([
            prisma.quotation.findMany({
                where,
                ...listArgs(query),
                select: {
                    id: true,
                    quotationNumber: true,
                    customerName: true,
                    customerPhone: true,
                    saleType: true,
                    quoteDate: true,
                    validUntil: true,
                    status: true,
                    totalAmount: true,
                    _count: {select: {items: true}},
                    salesBill: {select: {id: true, billNumber: true}},
                },
            }),
            prisma.quotation.count({where}),
            prisma.quotation.groupBy({
                by: ['status'],
                where: this.where(scope),
                _count: {_all: true},
                _sum: {totalAmount: true},
                orderBy: {status: 'asc'},
            }),
        ]);
        const today = new Date().setHours(0, 0, 0, 0);
        const summary = Object.fromEntries(
            groups.map((g) => [
                g.status,
                {
                    count: (g._count as {_all: number})._all,
                    value: round2((g._sum as {totalAmount: number | null}).totalAmount ?? 0),
                },
            ]),
        );
        return {
            ...toListResult(
                items.map(({_count, ...q}) => ({
                    ...q,
                    itemCount: _count.items,
                    expired: ['DRAFT', 'SENT'].includes(q.status) && q.validUntil.getTime() < today,
                })),
                total,
                query,
            ),
            summary,
        };
    }

    public async get(scope: ShopScope, id: string) {
        const q = await prisma.quotation.findFirst({where: this.where(scope, id), include: INCLUDE});
        if (!q) throw new ApiError(httpStatus.NOT_FOUND, 'Quotation not found');
        return q;
    }

    public async create(scope: ShopScope, actorId: string, data: CreateQuotation) {
        const shop = await billService.shopContext(scope);
        const created = await accountService.withRetry(
            () =>
                prisma.$transaction(async (tx) => {
                    const {items, totals} = await this.totals(tx, scope, data);
                    const prefix = `QT/${shop.billPrefix || shop.code}/${fy()}/`;
                    const quotationNumber = await accountService.nextCode(tx, prefix, 4, async (p) =>
                        (
                            await tx.quotation.findMany({
                                where: {shopId: shop.id, quotationNumber: {startsWith: p}},
                                select: {quotationNumber: true},
                            })
                        ).map((r) => r.quotationNumber),
                    );
                    const {items: _items, ...header} = data;
                    return tx.quotation.create({
                        data: {
                            ...header,
                            ...totals,
                            quotationNumber,
                            companyId: shop.companyId,
                            branchId: shop.branchId,
                            shopId: shop.id,
                            createdById: actorId,
                            items: {create: items},
                        },
                        select: {id: true},
                    });
                }),
            'quotationNumber',
        );
        return this.get(scope, created.id);
    }

    public async update(scope: ShopScope, id: string, data: UpdateQuotation) {
        const before = await this.get(scope, id);
        if (!['DRAFT', 'SENT'].includes(before.status)) {
            throw new ApiError(httpStatus.CONFLICT, `A ${before.status.toLowerCase()} quotation cannot be edited`);
        }
        await prisma.$transaction(async (tx) => {
            const {items: newItems, ...header} = data;
            let totals = {};
            if (newItems || data.extraCharges !== undefined) {
                const calc = await this.totals(tx, scope, {
                    items:
                        newItems ??
                        before.items.map((i) => ({
                            productId: i.productId ?? undefined,
                            variantId: i.variantId ?? undefined,
                            description: i.description,
                            hsnCode: i.hsnCode ?? undefined,
                            quantity: i.quantity,
                            unitPrice: i.unitPrice,
                            discount: i.discount,
                            taxRate: i.taxRate,
                        })),
                    extraCharges: data.extraCharges ?? before.extraCharges,
                });
                totals = calc.totals;
                if (newItems) {
                    await tx.quotationItem.deleteMany({where: {quotationId: id}});
                    await tx.quotationItem.createMany({data: calc.items.map((i) => ({...i, quotationId: id}))});
                }
            }
            await tx.quotation.update({where: {id}, data: {...header, ...totals}});
        });
        return {before, after: await this.get(scope, id)};
    }

    /** SENT / ACCEPTED / REJECTED; CONVERTED is set only by billing it */
    public async setStatus(scope: ShopScope, id: string, status: 'SENT' | 'ACCEPTED' | 'REJECTED') {
        const before = await this.get(scope, id);
        const allowed: Record<string, string[]> = {
            DRAFT: ['SENT', 'ACCEPTED', 'REJECTED'],
            SENT: ['ACCEPTED', 'REJECTED'],
            ACCEPTED: ['REJECTED'],
            REJECTED: [],
            CONVERTED: [],
        };
        if (!allowed[before.status]?.includes(status)) {
            throw new ApiError(
                httpStatus.CONFLICT,
                `A ${before.status.toLowerCase()} quotation cannot be marked ${status.toLowerCase()}`,
            );
        }
        await prisma.quotation.update({where: {id}, data: {status}});
        return {before, after: await this.get(scope, id)};
    }

    /** Only drafts can be deleted; sent quotes are kept for the record */
    public async delete(scope: ShopScope, id: string) {
        const before = await this.get(scope, id);
        if (before.status !== 'DRAFT') {
            throw new ApiError(httpStatus.CONFLICT, 'Only draft quotations can be deleted');
        }
        await prisma.quotation.delete({where: {id}});
        return {before};
    }

    /**
     * Everything the POS needs to bill this quotation: the catalog lines
     * (custom lines must be added to the catalog first) and the customer.
     */
    public async billDraft(scope: ShopScope, id: string) {
        const q = await this.get(scope, id);
        if (!['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status)) {
            throw new ApiError(httpStatus.CONFLICT, `A ${q.status.toLowerCase()} quotation cannot be billed`);
        }
        const custom = q.items.filter((i) => !i.variantId);
        return {
            quotationId: q.id,
            quotationNumber: q.quotationNumber,
            saleType: q.saleType,
            customerName: q.customerName,
            customerPhone: q.customerPhone,
            customerGstin: q.customerGstin,
            items: q.items
                .filter((i) => i.variantId)
                .map((i) => ({
                    variantId: i.variantId!,
                    productId: i.productId!,
                    name: i.product?.name ?? i.description,
                    variantName: i.variant?.variantName ?? '',
                    finish: i.variant?.finish ?? '',
                    quantity: i.quantity,
                    // The quote's price after its line discount, GST included (POS prices include GST)
                    unitPrice: round2(((i.unitPrice * i.quantity - i.discount) * (1 + i.taxRate / 100)) / i.quantity),
                })),
            customLines: custom.map((i) => ({description: i.description, quantity: i.quantity, totalPrice: i.totalPrice})),
        };
    }
}

export default new QuotationService();
