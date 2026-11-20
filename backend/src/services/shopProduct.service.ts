import httpStatus from 'http-status';
import {MovementType, Prisma, ProductStatus, StockSourceType} from '@prisma/client';
import {z} from 'zod';
import prisma from '../client';
import ApiError from '@utils/ApiError';
import {listArgs, toListResult} from '../utils/list';
import {shopProductValidation} from '@validations/index';
import accountService from './account.service';
import inventoryService from './inventory.service';
import limitService from './limit.service';
import shopGstService from './shopGst.service';
import companySettingsService from './companySettings.service';

type CreateShopProduct = z.infer<typeof shopProductValidation.createShopProductSchema>;
type UpdateShopProduct = z.infer<typeof shopProductValidation.updateShopProductSchema>;
type ShopProductList = z.infer<typeof shopProductValidation.shopProductListSchema>;
type VariantInput = CreateShopProduct['variants'][number];
type Tx = Prisma.TransactionClient;

/** Products of one branch outlet; always taken from the signed-in user */
export type ShopScope = {companyId: string; shopId: string};
/** Reading one product: a branch sees its own, a company admin (no shopId) any product of the company */
export type ProductScope = {companyId: string; shopId?: string};

const MAX_IMAGES = 8;

const LIST_INCLUDE = {
    category: {select: {id: true, name: true}},
    subcategory: {select: {id: true, name: true}},
    brand: {select: {id: true, name: true}},
    variants: {
        where: {isActive: true},
        orderBy: {createdAt: 'asc' as const},
        select: {
            id: true,
            variantSku: true,
            variantName: true,
            finish: true,
            barcode: true,
            mrp: true,
            sellingPrice: true,
            wholesalePrice: true,
        },
    },
    images: {orderBy: [{isMain: 'desc' as const}, {order: 'asc' as const}]},
} satisfies Prisma.ProductInclude;

const DETAIL_INCLUDE = {
    ...LIST_INCLUDE,
    createdBy: {select: {id: true, fullname: true}},
} satisfies Prisma.ProductInclude;

type ListRow = Prisma.ProductGetPayload<{include: typeof LIST_INCLUDE}>;

/** "3 Seater" + "Walnut" -> "3SEA-WAL" (variant SKU suffix) */
export const variantSuffix = (variantName: string, finish: string) =>
    `${variantName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}-${finish
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 3)}`.toUpperCase();

const slugify = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

/** `stock` is the live count; specifications go out as a {key, value} list */
const present = <T extends ListRow>(p: T, stock: number) => ({
    ...(p as Omit<typeof p, 'stockQuantity'>),
    // Only a cache that some stock paths do not update: never sent
    stockQuantity: undefined,
    stock,
    specifications: Array.isArray(p.specifications) ? p.specifications : [],
    mainImage: p.images[0]?.url ?? null,
});

const fieldError = (status: number, field: string, message: string) =>
    new ApiError(status, message, [{field, message}]);

class ShopProductService {
    private scopeWhere(scope: ShopScope, id?: string): Prisma.ProductWhereInput {
        return {
            ...(id ? {id} : {}),
            companyId: scope.companyId,
            shopId: scope.shopId,
            deletedAt: null,
        };
    }

    /**
     * Live stock per product of a branch: active variants in the branch,
     * physical - reserved, the same count the POS and the store sell from.
     */
    private async liveStock(shopId: string, productId?: string) {
        const rows = await prisma.$queryRaw<Array<{id: string; stock: number}>>`
            SELECT v."productId" AS id, SUM(GREATEST(i."physicalQty" - i."reservedQty", 0))::int AS stock
            FROM "Inventory" i
            JOIN "ProductVariant" v ON v.id = i."variantId" AND v."isActive"
            JOIN "Product" p ON p.id = v."productId"
            JOIN "Shop" s ON s.id = p."shopId" AND s."branchId" = i."branchId"
            WHERE p."shopId" = ${shopId} AND p."deletedAt" IS NULL
              ${productId ? Prisma.sql`AND p.id = ${productId}` : Prisma.empty}
            GROUP BY v."productId"`;
        return new Map(rows.map((r) => [r.id, r.stock]));
    }

    public async list(scope: ShopScope, query: ShopProductList) {
        const live = await this.liveStock(scope.shopId);
        const {lowStockDefault: LOW_STOCK} = await companySettingsService.get(scope.companyId);
        const qty = (id: string) => live.get(id) ?? 0;
        const having = (keep: (n: number) => boolean) => [...live.keys()].filter((id) => keep(qty(id)));
        const stockIds: Prisma.StringFilter | undefined =
            query.stock === 'out'
                ? {notIn: having((n) => n > 0)}
                : query.stock === 'low'
                  ? {in: having((n) => n > 0 && n <= LOW_STOCK)}
                  : query.stock === 'in'
                    ? {in: having((n) => n > 0)}
                    : undefined;
        const where: Prisma.ProductWhereInput = {
            ...this.scopeWhere(scope),
            id: stockIds,
            status: query.status,
            productKind: query.productKind,
            businessLine: query.businessLine,
            sourcing: query.sourcing,
            categoryId: query.categoryId,
            subcategoryId: query.subcategoryId,
            ...(query.search
                ? {
                      OR: [
                          {name: {contains: query.search, mode: 'insensitive'}},
                          {sku: {contains: query.search, mode: 'insensitive'}},
                          {productType: {contains: query.search, mode: 'insensitive'}},
                          {material: {contains: query.search, mode: 'insensitive'}},
                          {variants: {some: {barcode: query.search}}},
                          {tags: {has: query.search.toLowerCase()}},
                      ],
                  }
                : {}),
        };
        const {sortBy, sortDir} = query;
        if (sortBy !== 'stock') {
            const [items, total] = await prisma.$transaction([
                prisma.product.findMany({where, include: LIST_INCLUDE, ...listArgs({...query, sortBy})}),
                prisma.product.count({where}),
            ]);
            return toListResult(
                items.map((p) => present(p, qty(p.id))),
                total,
                query,
            );
        }
        // Stock is not a column: sort the matching ids by it, then load one page
        const ids = (await prisma.product.findMany({where, select: {id: true}, orderBy: {createdAt: 'desc'}}))
            .map((p) => p.id)
            .sort((a, b) => (sortDir === 'asc' ? qty(a) - qty(b) : qty(b) - qty(a)));
        const {skip, take} = listArgs(query);
        const page = ids.slice(skip, skip + take);
        const rows = await prisma.product.findMany({where: {id: {in: page}}, include: LIST_INCLUDE});
        const items = page.flatMap((id) => rows.filter((p) => p.id === id));
        return toListResult(
            items.map((p) => present(p, qty(p.id))),
            ids.length,
            query,
        );
    }

    /** 404 outside the caller's branch, or company when there is no branch (no probing others) */
    public async get(scope: ProductScope, id: string) {
        const product = await prisma.product.findFirst({
            where: {
                id,
                companyId: scope.companyId,
                deletedAt: null,
                ...(scope.shopId ? {shopId: scope.shopId} : {}),
            },
            include: DETAIL_INCLUDE,
        });
        if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
        const live = product.shopId ? await this.liveStock(product.shopId, id) : undefined;
        return present(product, live?.get(id) ?? 0);
    }

    /** Category and subcategory must be active and belong together; brand must be visible and active */
    private async assertRefs(
        scope: {companyId: string},
        data: {categoryId: string; subcategoryId?: string | null; brandId?: string | null},
    ) {
        const {companyId} = scope;
        // Only the company's own masters or platform-wide ones
        const visible = {OR: [{companyId}, {companyId: null}]};
        const [category, subcategory, brand] = await Promise.all([
            prisma.category.findFirst({where: {id: data.categoryId, ...visible}, select: {isActive: true}}),
            data.subcategoryId
                ? prisma.subcategory.findFirst({
                      where: {id: data.subcategoryId, ...visible},
                      select: {isActive: true, categoryId: true},
                  })
                : null,
            data.brandId
                ? prisma.brand.findFirst({where: {id: data.brandId, ...visible}, select: {isActive: true}})
                : null,
        ]);
        if (!category?.isActive) {
            throw fieldError(httpStatus.BAD_REQUEST, 'categoryId', 'Select an active category');
        }
        if (data.subcategoryId && !subcategory?.isActive) {
            throw fieldError(httpStatus.BAD_REQUEST, 'subcategoryId', 'Select an active subcategory');
        }
        if (subcategory && subcategory.categoryId !== data.categoryId) {
            throw fieldError(
                httpStatus.BAD_REQUEST,
                'subcategoryId',
                'This subcategory does not belong to the selected category',
            );
        }
        if (data.brandId && !brand?.isActive) {
            throw fieldError(httpStatus.BAD_REQUEST, 'brandId', 'Select an active brand');
        }
    }

    private async assertSkuFree(sku: string, exceptId?: string) {
        const taken = await prisma.product.findUnique({where: {sku}, select: {id: true}});
        if (taken && taken.id !== exceptId) {
            throw fieldError(httpStatus.CONFLICT, 'sku', 'This SKU is already used by another product');
        }
    }

    /**
     * Make the product's active variants exactly the given list: rows with an
     * id are updated, new ones created, the rest deactivated (kept for bill and
     * order history). Inventory rows are opened in the branch. Returns the id
     * of each newly created variant in list order (null for existing ones).
     */
    private async syncVariants(tx: Tx, productId: string, sku: string, list: VariantInput[]) {
        const product = await tx.product.findUniqueOrThrow({
            where: {id: productId},
            select: {companyId: true, shop: {select: {branchId: true}}, variants: {select: {id: true}}},
        });
        const own = new Set(product.variants.map((v) => v.id));
        const keep: string[] = [];
        const created: (string | null)[] = [];
        for (const v of list) {
            const prices = {
                mrp: v.mrp ?? null,
                sellingPrice: v.sellingPrice ?? null,
                wholesalePrice: v.wholesalePrice ?? null,
            };
            if (v.id && own.has(v.id)) {
                await tx.productVariant.update({
                    where: {id: v.id},
                    data: {variantName: v.variantName, finish: v.finish, isActive: true, ...prices},
                });
                keep.push(v.id);
                created.push(null);
                continue;
            }
            let variantSku = `${sku}-${variantSuffix(v.variantName, v.finish)}`;
            if (await tx.productVariant.findUnique({where: {variantSku}})) {
                variantSku = `${variantSku}-${Date.now().toString(36).toUpperCase()}`;
            }
            const row = await tx.productVariant.create({
                data: {
                    productId,
                    variantSku,
                    barcode: variantSku,
                    variantName: v.variantName,
                    finish: v.finish,
                    ...prices,
                },
                select: {id: true},
            });
            keep.push(row.id);
            created.push(row.id);
        }
        await tx.productVariant.updateMany({where: {productId, id: {notIn: keep}}, data: {isActive: false}});

        const branchId = product.shop?.branchId;
        if (branchId) {
            const {lowStockDefault} = await companySettingsService.get(product.companyId, tx);
            for (const variantId of keep) {
                await tx.inventory.upsert({
                    where: {branchId_variantId: {branchId, variantId}},
                    create: {branchId, variantId, physicalQty: 0, reservedQty: 0, threshold: lowStockDefault},
                    update: {},
                });
            }
        }
        return created;
    }

    public async create(scope: ShopScope, actorId: string, data: CreateShopProduct) {
        await limitService.assertCanAdd(scope.companyId, 'products');
        await this.assertRefs(scope, data);
        if (data.sku) await this.assertSkuFree(data.sku);
        await shopGstService.assertRateAllowed(scope.shopId, data.taxRate);
        const [company, shop] = await Promise.all([
            prisma.company.findUniqueOrThrow({where: {id: scope.companyId}, select: {code: true}}),
            prisma.shop.findUniqueOrThrow({where: {id: scope.shopId}, select: {branchId: true}}),
        ]);
        const {variants, sku: givenSku, sellingPrice, wholesalePrice, purchasePrice, ...fields} = data;

        const created = await accountService.withRetry(
            () =>
                prisma.$transaction(async (tx) => {
                    const sku =
                        givenSku ??
                        (await accountService.nextCode(tx, `${company.code}-P`, 4, async (prefix) =>
                            (
                                await tx.product.findMany({
                                    where: {sku: {startsWith: prefix}},
                                    select: {sku: true},
                                })
                            ).map((p) => p.sku),
                        ));
                    // The store link: set once, never rebuilt
                    let slug = `${slugify(fields.name)}-${sku.toLowerCase()}`;
                    if (await tx.product.findUnique({where: {slug}, select: {id: true}})) {
                        slug = `${slug}-${Date.now().toString(36)}`;
                    }
                    const product = await tx.product.create({
                        data: {
                            ...fields,
                            sellingPrice: sellingPrice ?? fields.mrp,
                            wholesalePrice: wholesalePrice ?? 0,
                            purchasePrice: purchasePrice ?? 0,
                            tags: fields.tags.map((t) => t.toLowerCase()),
                            companyId: scope.companyId,
                            shopId: scope.shopId,
                            sku,
                            slug,
                            createdById: actorId,
                        },
                        select: {id: true},
                    });
                    const made = await this.syncVariants(tx, product.id, sku, variants);
                    const opening = variants
                        .map((v, i) => ({variantId: made[i], quantity: v.openingStock}))
                        .filter(
                            (o): o is {variantId: string; quantity: number} => !!o.variantId && o.quantity > 0,
                        );
                    if (opening.length) {
                        await inventoryService.applyStockChanges(tx, {
                            branchId: shop.branchId,
                            changes: opening.map((o) => ({
                                variantId: o.variantId,
                                productId: product.id,
                                delta: o.quantity,
                                type: MovementType.ADJUSTMENT_INCREASE,
                            })),
                            reason: 'Opening stock',
                            reference: sku,
                            sourceType: StockSourceType.ADJUSTMENT,
                            performedById: actorId,
                        });
                    }
                    return product;
                }),
            'sku',
        );
        return this.get(scope, created.id);
    }

    public async update(scope: ShopScope, id: string, data: UpdateShopProduct) {
        const before = await this.get(scope, id);
        const merged = {
            categoryId: data.categoryId ?? before.categoryId,
            // null = cleared on purpose; undefined = not sent, keep the current one
            subcategoryId: data.subcategoryId !== undefined ? data.subcategoryId : before.subcategoryId,
            brandId: data.brandId !== undefined ? data.brandId : before.brandId,
            mrp: data.mrp ?? before.mrp,
            sellingPrice: data.sellingPrice ?? (data.mrp !== undefined ? data.mrp : before.sellingPrice),
        };
        if (merged.sellingPrice > merged.mrp) {
            throw fieldError(httpStatus.BAD_REQUEST, 'sellingPrice', 'Selling Price cannot be more than MRP');
        }
        await this.assertRefs({companyId: scope.companyId}, merged);
        if (data.sku && data.sku !== before.sku) await this.assertSkuFree(data.sku, id);
        if (data.taxRate !== undefined && data.taxRate !== before.taxRate && before.shopId) {
            await shopGstService.assertRateAllowed(before.shopId, data.taxRate);
        }

        const {variants, ...fields} = data;
        const sku = data.sku ?? before.sku;
        await prisma.$transaction(async (tx) => {
            await tx.product.update({
                where: {id},
                data: {
                    ...fields,
                    sellingPrice: merged.sellingPrice,
                    // Shown in the branch's "Changed this week" price list
                    ...(merged.sellingPrice !== before.sellingPrice ? {priceChangedAt: new Date()} : {}),
                    ...(fields.tags ? {tags: fields.tags.map((t) => t.toLowerCase())} : {}),
                },
            });
            // New variants added on edit start at zero; stock comes from bills and adjustments
            if (variants) await this.syncVariants(tx, id, sku, variants);
        });
        return {before, after: await this.get(scope, id)};
    }

    /** Soft delete: hidden from the branch, kept for order history */
    public async delete(scope: ShopScope, id: string) {
        const before = await this.get(scope, id);
        await prisma.product.update({
            where: {id},
            data: {deletedAt: new Date(), status: ProductStatus.ARCHIVED},
        });
        return {before};
    }

    // ---- Images ----

    public async addImages(scope: ShopScope, id: string, urls: string[]) {
        const product = await this.get(scope, id);
        if (product.images.length + urls.length > MAX_IMAGES) {
            throw new ApiError(httpStatus.BAD_REQUEST, `A product can have at most ${MAX_IMAGES} images`);
        }
        const start = product.images.length;
        await prisma.productImage.createMany({
            data: urls.map((url, i) => ({
                productId: id,
                url,
                altText: product.name,
                order: start + i,
                isMain: start === 0 && i === 0,
            })),
        });
        return this.get(scope, id);
    }

    public async updateImage(
        scope: ShopScope,
        id: string,
        imageId: string,
        data: {altText?: string; isMain?: boolean},
    ) {
        const product = await this.get(scope, id);
        if (!product.images.some((img) => img.id === imageId)) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Image not found');
        }
        await prisma.$transaction([
            ...(data.isMain
                ? [prisma.productImage.updateMany({where: {productId: id}, data: {isMain: false}})]
                : []),
            prisma.productImage.update({where: {id: imageId}, data}),
        ]);
        return this.get(scope, id);
    }

    public async deleteImage(scope: ShopScope, id: string, imageId: string) {
        const product = await this.get(scope, id);
        const image = product.images.find((img) => img.id === imageId);
        if (!image) throw new ApiError(httpStatus.NOT_FOUND, 'Image not found');
        await prisma.productImage.delete({where: {id: imageId}});
        if (image.isMain) {
            const next = product.images.find((img) => img.id !== imageId);
            if (next) await prisma.productImage.update({where: {id: next.id}, data: {isMain: true}});
        }
        return this.get(scope, id);
    }
}

export default new ShopProductService();
