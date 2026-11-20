import httpStatus from 'http-status';
import {MovementType, Prisma, ProductKind, Role, StockSourceType, WorkOrderStatus} from '@prisma/client';
import {z} from 'zod';
import prisma from '../client';
import ApiError from '@utils/ApiError';
import {listArgs, toListResult} from '../utils/list';
import v, {DEFAULT_STAGES} from '../validations/manufacturing.validation';
import accountService from './account.service';
import billService from './bill.service';
import inventoryService from './inventory.service';
import limitService from './limit.service';
import {ShopScope} from './shopProduct.service';

/*
 * Manufacturing (M1 process) of a branch:
 *
 *   PLANNED ──issue raw material──▶ MATERIAL_ISSUED ──stages──▶ IN_PROGRESS
 *     ──all stages done──▶ QUALITY_CHECK ──QC pass + complete──▶ COMPLETED
 *       made to stock : finished pieces go into stock (rack no), sold from there
 *       made to order : a delivery is scheduled to the customer ──▶ DELIVERED
 *
 * Raw material leaves stock when issued (PRODUCTION_ISSUE), unused material
 * comes back (PRODUCTION_RETURN) and finished goods come in (PRODUCTION_IN),
 * all through inventoryService.applyStockChanges in one transaction.
 * Cost = issued material at purchase cost + accessories + labour + overhead.
 */

type Tx = Prisma.TransactionClient;
type CreateWO = z.infer<typeof v.createWorkOrderSchema>;
type UpdateWO = z.infer<typeof v.updateWorkOrderSchema>;
type ListWO = z.infer<typeof v.listWorkOrdersSchema>;
type Stage = {key: string; label: string; done: boolean; at: string | null; by: string | null};
type Accessory = {name: string; quantity: number; price: number};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fy = (d = new Date()) => {
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};
const RAW_KINDS: ProductKind[] = [ProductKind.RAW_MATERIAL, ProductKind.HARDWARE];
const OPEN: WorkOrderStatus[] = [WorkOrderStatus.PLANNED, WorkOrderStatus.MATERIAL_ISSUED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.QUALITY_CHECK];

const DETAIL = {
    product: {select: {id: true, name: true, sku: true, unit: true, sourcing: true, images: {select: {url: true}, take: 1}}},
    variant: {select: {id: true, variantName: true, finish: true, variantSku: true}},
    assignedTo: {select: {id: true, fullname: true}},
    order: {select: {id: true, orderNumber: true, status: true}},
    salesBill: {select: {id: true, billNumber: true, totalAmount: true}},
    materials: {
        include: {
            variant: {
                select: {
                    id: true,
                    variantName: true,
                    finish: true,
                    variantSku: true,
                    product: {select: {id: true, name: true, unit: true, purchasePrice: true, productKind: true}},
                },
            },
        },
        orderBy: {id: 'asc' as const},
    },
    deliveries: {
        select: {id: true, deliveryNumber: true, status: true, scheduledDate: true, deliveredAt: true},
        orderBy: {createdAt: 'desc' as const},
    },
} satisfies Prisma.WorkOrderInclude;

class ManufacturingService {
    /* ------------------------------------------------------------------ helpers */

    private async context(scope: ShopScope) {
        const shop = await billService.shopContext(scope);
        await limitService.assertModule(scope.companyId, 'manufacturing');
        return shop;
    }

    private async load(tx: Tx | typeof prisma, branchId: string, id: string) {
        const wo = await tx.workOrder.findFirst({where: {id, branchId}, include: DETAIL});
        if (!wo) throw new ApiError(httpStatus.NOT_FOUND, 'Work order not found');
        return wo;
    }

    /** Raw material / hardware variants of this branch, with stock and cost */
    private async rawVariants(tx: Tx | typeof prisma, scope: ShopScope, ids: string[]) {
        if (!ids.length) return new Map<string, {id: string; productId: string; label: string; cost: number}>();
        const rows = await tx.productVariant.findMany({
            where: {id: {in: ids}, isActive: true, product: {shopId: scope.shopId, deletedAt: null, productKind: {in: RAW_KINDS}}},
            select: {id: true, variantName: true, finish: true, productId: true, product: {select: {name: true, purchasePrice: true}}},
        });
        if (rows.length !== new Set(ids).size) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Choose raw material or hardware items of this branch', [
                {field: 'materials', message: 'One of the materials is not a raw material of this branch'},
            ]);
        }
        return new Map(
            rows.map((r) => [
                r.id,
                {id: r.id, productId: r.productId, label: `${r.product.name} (${r.variantName}${r.finish ? ` / ${r.finish}` : ''})`, cost: r.product.purchasePrice ?? 0},
            ]),
        );
    }

    private materialCost(materials: {issuedQty: number; returnedQty: number; unitCost: number}[]) {
        return round2(materials.reduce((t, m) => t + (m.issuedQty - m.returnedQty) * m.unitCost, 0));
    }

    /** Cost per finished piece and the totals behind it */
    private costing(wo: {materialCost: number; labourCost: number; overheadCost: number; accessories: Prisma.JsonValue; quantity: number; quotedPrice: number | null}) {
        const accessories = ((wo.accessories as Accessory[] | null) ?? []).reduce((t, a) => t + a.price * a.quantity, 0);
        const total = round2(wo.materialCost + wo.labourCost + wo.overheadCost + accessories);
        return {
            material: wo.materialCost,
            accessories: round2(accessories),
            labour: wo.labourCost,
            overhead: wo.overheadCost,
            total,
            perUnit: wo.quantity ? round2(total / wo.quantity) : 0,
            margin: wo.quotedPrice ? round2(wo.quotedPrice - total) : null,
        };
    }

    private shape<T extends {stages: Prisma.JsonValue; accessories: Prisma.JsonValue; materialCost: number; labourCost: number; overheadCost: number; quantity: number; quotedPrice: number | null; status: WorkOrderStatus; dueDate: Date | null}>(wo: T) {
        const stages = (wo.stages as Stage[]) ?? [];
        const {stages: _s, accessories: _a, ...rest} = wo;
        void _s;
        void _a;
        return {
            ...rest,
            stages,
            accessories: (wo.accessories as Accessory[]) ?? [],
            progress: stages.length ? Math.round((stages.filter((s) => s.done).length / stages.length) * 100) : 0,
            overdue: !!wo.dueDate && OPEN.includes(wo.status) && wo.dueDate.getTime() < Date.now(),
            cost: this.costing(wo),
        };
    }

    /* ------------------------------------------------------------------ queries */

    public async list(scope: ShopScope, q: ListWO) {
        const shop = await this.context(scope);
        const term = q.search.trim();
        const where: Prisma.WorkOrderWhereInput = {
            branchId: shop.branchId,
            ...(q.status ? {status: q.status} : {}),
            ...(q.type ? {type: q.type} : {}),
            ...(term
                ? {
                      OR: [
                          {woNumber: {contains: term, mode: 'insensitive'}},
                          {title: {contains: term, mode: 'insensitive'}},
                          {customerName: {contains: term, mode: 'insensitive'}},
                          {customerPhone: {contains: term}},
                          {rackNo: {contains: term, mode: 'insensitive'}},
                      ],
                  }
                : {}),
        };
        const [items, total, byStatus, overdue] = await Promise.all([
            prisma.workOrder.findMany({
                where,
                include: {
                    assignedTo: {select: {id: true, fullname: true}},
                    variant: {select: {variantName: true, finish: true}},
                    product: {select: {images: {select: {url: true}, take: 1}}},
                },
                ...listArgs(q),
            }),
            prisma.workOrder.count({where}),
            prisma.workOrder.groupBy({by: ['status'], where: {branchId: shop.branchId}, _count: {_all: true}}),
            prisma.workOrder.count({where: {branchId: shop.branchId, status: {in: OPEN}, dueDate: {lt: new Date()}}}),
        ]);
        return {
            ...toListResult(
                items.map((w) => this.shape(w)),
                total,
                q,
            ),
            summary: {
                byStatus: Object.fromEntries(byStatus.map((g) => [g.status, (g._count as {_all: number})._all])),
                overdue,
            },
        };
    }

    public async get(scope: ShopScope, id: string) {
        const shop = await this.context(scope);
        const wo = await this.load(prisma, shop.branchId, id);
        // Stock on hand of each material, to show what can still be issued
        const stock = await prisma.inventory.findMany({
            where: {branchId: shop.branchId, variantId: {in: wo.materials.map((m) => m.variantId)}},
            select: {variantId: true, physicalQty: true, reservedQty: true, rackNo: true},
        });
        const byVariant = new Map(stock.map((s) => [s.variantId, s]));
        return {
            ...this.shape(wo),
            materials: wo.materials.map((m) => ({
                ...m,
                inStock: Math.max(0, (byVariant.get(m.variantId)?.physicalQty ?? 0) - (byVariant.get(m.variantId)?.reservedQty ?? 0)),
                rackNo: byVariant.get(m.variantId)?.rackNo ?? null,
                toIssue: Math.max(0, m.plannedQty - (m.issuedQty - m.returnedQty)),
            })),
        };
    }

    /** Pickers for the work order form: finished goods to make, raw material, the team */
    public async options(scope: ShopScope) {
        const shop = await this.context(scope);
        const [finished, raw, team] = await Promise.all([
            prisma.product.findMany({
                where: {shopId: scope.shopId, deletedAt: null, productKind: ProductKind.FINISHED_GOOD, businessLine: 'FURNITURE'},
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    sourcing: true,
                    category: {select: {name: true}},
                    productType: true,
                    material: true,
                    lengthCm: true,
                    widthCm: true,
                    heightCm: true,
                    _count: {select: {bomLines: true}},
                    variants: {where: {isActive: true}, select: {id: true, variantName: true, finish: true}},
                },
                orderBy: [{sourcing: 'desc'}, {name: 'asc'}],
            }),
            prisma.productVariant.findMany({
                where: {isActive: true, product: {shopId: scope.shopId, deletedAt: null, productKind: {in: RAW_KINDS}}},
                select: {
                    id: true,
                    variantName: true,
                    finish: true,
                    product: {select: {name: true, unit: true, purchasePrice: true, productKind: true}},
                    inventories: {where: {branchId: shop.branchId}, select: {physicalQty: true, reservedQty: true, rackNo: true}},
                },
                orderBy: {product: {name: 'asc'}},
            }),
            prisma.user.findMany({
                where: {branchId: shop.branchId, deletedAt: null, role: {in: [Role.BRANCH_MANAGER, Role.EMPLOYEE]}, status: 'ACTIVE'},
                select: {id: true, fullname: true, role: true, department: true},
                orderBy: {fullname: 'asc'},
            }),
        ]);
        return {
            stages: DEFAULT_STAGES,
            finished: finished.map(({_count, ...p}) => ({...p, hasBom: _count.bomLines > 0})),
            raw: raw.map((r) => ({
                variantId: r.id,
                name: r.product.name,
                variantName: r.variantName,
                finish: r.finish,
                unit: r.product.unit,
                kind: r.product.productKind,
                cost: r.product.purchasePrice ?? 0,
                inStock: Math.max(0, (r.inventories[0]?.physicalQty ?? 0) - (r.inventories[0]?.reservedQty ?? 0)),
                rackNo: r.inventories[0]?.rackNo ?? null,
            })),
            team,
        };
    }

    /* ------------------------------------------------------------------ create / edit */

    /** The finished item must be a product of this branch; returns its BOM */
    private async finishedItem(tx: Tx | typeof prisma, scope: ShopScope, productId?: string, variantId?: string) {
        if (!productId && !variantId) return null;
        const variant = variantId
            ? await tx.productVariant.findFirst({
                  where: {id: variantId, isActive: true, product: {shopId: scope.shopId, deletedAt: null, productKind: ProductKind.FINISHED_GOOD}},
                  select: {id: true, productId: true},
              })
            : null;
        if (variantId && !variant) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a finished product of this branch', [{field: 'variantId', message: 'Not a product of this branch'}]);
        }
        const pid = variant?.productId ?? productId!;
        if (productId && variant && productId !== variant.productId) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'The variant does not belong to the chosen product', [{field: 'variantId', message: 'Choose a variant of this product'}]);
        }
        const product = await tx.product.findFirst({
            where: {id: pid, shopId: scope.shopId, deletedAt: null, productKind: ProductKind.FINISHED_GOOD},
            select: {id: true, name: true, bomLines: {select: {materialVariantId: true, quantity: true, wastagePct: true}}},
        });
        if (!product) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a finished product of this branch', [{field: 'productId', message: 'Not a product of this branch'}]);
        return {productId: product.id, variantId: variant?.id ?? null, name: product.name, bom: product.bomLines};
    }

    /** Linked online order / sales bill must be of this branch; fills the customer from it */
    private async linkedCustomer(tx: Tx | typeof prisma, branchId: string, data: {orderId?: string; salesBillId?: string}) {
        if (data.orderId) {
            const o = await tx.order.findFirst({where: {id: data.orderId, branchId}, select: {shippingAddress: true, customer: {select: {fullname: true, phoneNumber: true}}}});
            if (!o) throw new ApiError(httpStatus.BAD_REQUEST, 'Online order not found in this branch', [{field: 'orderId', message: 'Order not found'}]);
            const a = (o.shippingAddress ?? {}) as {recipient?: string; phone?: string; address1?: string; address2?: string; city?: string; postalCode?: string};
            return {
                customerName: a.recipient ?? o.customer?.fullname ?? null,
                customerPhone: a.phone ?? o.customer?.phoneNumber ?? null,
                customerAddress: [a.address1, a.address2, a.city, a.postalCode].filter(Boolean).join(', ') || null,
            };
        }
        if (data.salesBillId) {
            const b = await tx.salesBill.findFirst({where: {id: data.salesBillId, branchId, deletedAt: null}, select: {customerName: true, customerPhone: true}});
            if (!b) throw new ApiError(httpStatus.BAD_REQUEST, 'Sales bill not found in this branch', [{field: 'salesBillId', message: 'Bill not found'}]);
            return {customerName: b.customerName, customerPhone: b.customerPhone, customerAddress: null};
        }
        return null;
    }

    private async assertTeam(tx: Tx | typeof prisma, branchId: string, userId?: string | null) {
        if (!userId) return;
        const u = await tx.user.findFirst({where: {id: userId, branchId, deletedAt: null}, select: {id: true}});
        if (!u) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a person from this branch', [{field: 'assignedToId', message: 'Not in this branch'}]);
    }

    public async create(scope: ShopScope, actorId: string, data: CreateWO) {
        const shop = await this.context(scope);
        return accountService.withRetry(
            () =>
                prisma.$transaction(async (tx) => {
                    const item = await this.finishedItem(tx, scope, data.productId, data.variantId);
                    const linked = await this.linkedCustomer(tx, shop.branchId, data);
                    await this.assertTeam(tx, shop.branchId, data.assignedToId);

                    // Materials: as sent, or the product's bill of materials x quantity (+ wastage)
                    const lines =
                        data.materials && data.materials.length
                            ? data.materials
                            : (item?.bom ?? []).map((b) => ({
                                  variantId: b.materialVariantId,
                                  plannedQty: Math.max(1, Math.ceil(b.quantity * data.quantity * (1 + b.wastagePct / 100))),
                              }));
                    const raw = await this.rawVariants(tx, scope, lines.map((l) => l.variantId));

                    const prefix = `WO/${shop.billPrefix || shop.code}/${fy()}/`;
                    const woNumber = await accountService.nextCode(tx, prefix, 4, async (p) =>
                        (await tx.workOrder.findMany({where: {branchId: shop.branchId, woNumber: {startsWith: p}}, select: {woNumber: true}})).map((w) => w.woNumber),
                    );
                    const {materials: _m, productId: _p, variantId: _v, ...fields} = data;
                    void _m;
                    void _p;
                    void _v;
                    const created = await tx.workOrder.create({
                        data: {
                            ...fields,
                            woNumber,
                            companyId: shop.companyId,
                            branchId: shop.branchId,
                            productId: item?.productId ?? null,
                            variantId: item?.variantId ?? null,
                            customerName: data.customerName ?? linked?.customerName ?? null,
                            customerPhone: data.customerPhone ?? linked?.customerPhone ?? null,
                            customerAddress: data.customerAddress ?? linked?.customerAddress ?? null,
                            accessories: data.accessories as Prisma.InputJsonValue,
                            stages: DEFAULT_STAGES.map((s) => ({...s, done: false, at: null, by: null})),
                            createdById: actorId,
                            materials: {create: lines.map((l) => ({variantId: l.variantId, plannedQty: l.plannedQty, unitCost: raw.get(l.variantId)!.cost}))},
                        },
                        select: {id: true},
                    });
                    return this.load(tx, shop.branchId, created.id);
                }),
            'woNumber',
        ).then((wo) => this.shape(wo));
    }

    public async update(scope: ShopScope, id: string, data: UpdateWO) {
        const shop = await this.context(scope);
        return prisma.$transaction(async (tx) => {
            const wo = await this.load(tx, shop.branchId, id);
            if (!OPEN.includes(wo.status)) throw new ApiError(httpStatus.CONFLICT, `A ${wo.status.toLowerCase()} work order cannot be edited`);
            await this.assertTeam(tx, shop.branchId, data.assignedToId);

            // What is made and the material plan can change only before material is issued
            const planned = wo.status === WorkOrderStatus.PLANNED;
            const locked = ['type', 'productId', 'variantId', 'quantity', 'materials'] as const;
            if (!planned && locked.some((k) => data[k] !== undefined)) {
                throw new ApiError(httpStatus.CONFLICT, 'Material is already issued: the item, quantity and materials can no longer change');
            }
            const {materials, productId, variantId, ...fields} = data;
            let item: Awaited<ReturnType<typeof this.finishedItem>> | undefined;
            if (productId !== undefined || variantId !== undefined) item = await this.finishedItem(tx, scope, productId, variantId);
            if (materials) {
                const raw = await this.rawVariants(tx, scope, materials.map((m) => m.variantId));
                await tx.workOrderMaterial.deleteMany({where: {workOrderId: id}});
                await tx.workOrderMaterial.createMany({
                    data: materials.map((m) => ({workOrderId: id, variantId: m.variantId, plannedQty: m.plannedQty, unitCost: raw.get(m.variantId)!.cost})),
                });
            }
            await tx.workOrder.update({
                where: {id},
                data: {
                    ...fields,
                    ...(fields.accessories ? {accessories: fields.accessories as Prisma.InputJsonValue} : {}),
                    ...(item !== undefined ? {productId: item?.productId ?? null, variantId: item?.variantId ?? null} : {}),
                },
            });
            return this.shape(await this.load(tx, shop.branchId, id));
        });
    }

    /* ------------------------------------------------------------------ process */

    /** Issue raw material from stock to the job (all that is still to issue, or the given lines) */
    public async issue(scope: ShopScope, actorId: string, id: string, lines?: {variantId: string; quantity: number}[]) {
        const shop = await this.context(scope);
        return prisma.$transaction(async (tx) => {
            const wo = await this.load(tx, shop.branchId, id);
            if (!([WorkOrderStatus.PLANNED, WorkOrderStatus.MATERIAL_ISSUED, WorkOrderStatus.IN_PROGRESS] as WorkOrderStatus[]).includes(wo.status)) {
                throw new ApiError(httpStatus.CONFLICT, 'Material can be issued only before quality check');
            }
            const wanted = lines?.length
                ? lines
                : wo.materials
                      .map((m) => ({variantId: m.variantId, quantity: m.plannedQty - (m.issuedQty - m.returnedQty)}))
                      .filter((l) => l.quantity > 0);
            if (!wanted.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing left to issue for this work order');

            // Extra material not in the plan (e.g. more foam) is added to the job
            const raw = await this.rawVariants(tx, scope, wanted.map((l) => l.variantId));
            await inventoryService.applyStockChanges(tx, {
                branchId: shop.branchId,
                reason: `Issued to work order ${wo.woNumber}`,
                reference: wo.woNumber,
                sourceType: StockSourceType.WORK_ORDER,
                sourceId: wo.id,
                performedById: actorId,
                changes: wanted.map((l) => ({variantId: l.variantId, productId: raw.get(l.variantId)!.productId, type: MovementType.PRODUCTION_ISSUE, delta: -l.quantity})),
            });
            for (const l of wanted) {
                await tx.workOrderMaterial.upsert({
                    where: {workOrderId_variantId: {workOrderId: id, variantId: l.variantId}},
                    create: {workOrderId: id, variantId: l.variantId, plannedQty: 0, issuedQty: l.quantity, unitCost: raw.get(l.variantId)!.cost},
                    update: {issuedQty: {increment: l.quantity}, unitCost: raw.get(l.variantId)!.cost},
                });
            }
            const mats = await tx.workOrderMaterial.findMany({where: {workOrderId: id}});
            await tx.workOrder.update({
                where: {id},
                data: {
                    materialCost: this.materialCost(mats),
                    status: wo.status === WorkOrderStatus.PLANNED ? WorkOrderStatus.MATERIAL_ISSUED : wo.status,
                    startDate: wo.startDate ?? new Date(),
                },
            });
            return this.shape(await this.load(tx, shop.branchId, id));
        });
    }

    /** Unused material back to stock */
    public async returnMaterial(scope: ShopScope, actorId: string, id: string, lines: {variantId: string; quantity: number}[]) {
        const shop = await this.context(scope);
        return prisma.$transaction(async (tx) => {
            const wo = await this.load(tx, shop.branchId, id);
            if (wo.status === WorkOrderStatus.DELIVERED || wo.status === WorkOrderStatus.CANCELLED) {
                throw new ApiError(httpStatus.CONFLICT, 'This work order is closed');
            }
            for (const l of lines) {
                const m = wo.materials.find((x) => x.variantId === l.variantId);
                const out = m ? m.issuedQty - m.returnedQty : 0;
                if (l.quantity > out) {
                    throw new ApiError(httpStatus.BAD_REQUEST, `Only ${out} of ${m?.variant.product.name ?? 'this material'} is with the work order`);
                }
            }
            await inventoryService.applyStockChanges(tx, {
                branchId: shop.branchId,
                reason: `Returned from work order ${wo.woNumber}`,
                reference: wo.woNumber,
                sourceType: StockSourceType.WORK_ORDER,
                sourceId: wo.id,
                performedById: actorId,
                changes: lines.map((l) => ({
                    variantId: l.variantId,
                    productId: wo.materials.find((x) => x.variantId === l.variantId)!.variant.product.id,
                    type: MovementType.PRODUCTION_RETURN,
                    delta: l.quantity,
                })),
            });
            for (const l of lines) {
                await tx.workOrderMaterial.update({where: {workOrderId_variantId: {workOrderId: id, variantId: l.variantId}}, data: {returnedQty: {increment: l.quantity}}});
            }
            const mats = await tx.workOrderMaterial.findMany({where: {workOrderId: id}});
            await tx.workOrder.update({where: {id}, data: {materialCost: this.materialCost(mats)}});
            return this.shape(await this.load(tx, shop.branchId, id));
        });
    }

    /** Tick a process stage; the last one moves the job to quality check */
    public async setStage(scope: ShopScope, actor: {id: string; fullname?: string | null}, id: string, key: string, done: boolean) {
        const shop = await this.context(scope);
        const wo = await this.load(prisma, shop.branchId, id);
        const allowed: WorkOrderStatus[] = [WorkOrderStatus.MATERIAL_ISSUED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.QUALITY_CHECK];
        // A job without raw material (e.g. assembly of bought parts) can start straight away
        if (!(allowed.includes(wo.status) || (wo.status === WorkOrderStatus.PLANNED && wo.materials.length === 0))) {
            throw new ApiError(httpStatus.CONFLICT, wo.status === WorkOrderStatus.PLANNED ? 'Issue the raw material first' : 'This work order is closed');
        }
        const stages = (wo.stages as Stage[]).map((s) =>
            s.key === key ? {...s, done, at: done ? new Date().toISOString() : null, by: done ? (actor.fullname ?? null) : null} : s,
        );
        if (!stages.some((s) => s.key === key)) throw new ApiError(httpStatus.BAD_REQUEST, 'Unknown stage');
        const allDone = stages.every((s) => s.done);
        const status = allDone ? WorkOrderStatus.QUALITY_CHECK : WorkOrderStatus.IN_PROGRESS;
        await prisma.workOrder.update({
            where: {id},
            // Reopening a stage after QC clears the QC result
            data: {stages, status, ...(allDone ? {} : {qcPassed: null}), startDate: wo.startDate ?? new Date()},
        });
        return this.get(scope, id);
    }

    public async qc(scope: ShopScope, id: string, passed: boolean, notes?: string) {
        const shop = await this.context(scope);
        const wo = await this.load(prisma, shop.branchId, id);
        if (wo.status !== WorkOrderStatus.QUALITY_CHECK) throw new ApiError(httpStatus.CONFLICT, 'Finish every stage before quality check');
        if (!passed && !notes) throw new ApiError(httpStatus.BAD_REQUEST, 'Note what failed', [{field: 'notes', message: 'Note what failed so it can be fixed'}]);
        // A failed QC sends the finishing stages (polish, upholstery, packing) back for rework
        const stages = passed
            ? (wo.stages as Stage[])
            : (wo.stages as Stage[]).map((s, i, all) => (i >= all.length - 3 ? {...s, done: false, at: null, by: null} : s));
        await prisma.workOrder.update({
            where: {id},
            data: {qcPassed: passed, qcNotes: notes ?? null, stages, status: passed ? WorkOrderStatus.QUALITY_CHECK : WorkOrderStatus.IN_PROGRESS},
        });
        return this.get(scope, id);
    }

    /** QC passed: made to stock goes into stock (on its rack); made to order waits for delivery */
    public async complete(scope: ShopScope, actorId: string, id: string, rackNo?: string) {
        const shop = await this.context(scope);
        return prisma.$transaction(async (tx) => {
            const wo = await this.load(tx, shop.branchId, id);
            if (wo.status !== WorkOrderStatus.QUALITY_CHECK || wo.qcPassed !== true) {
                throw new ApiError(httpStatus.CONFLICT, 'Pass the quality check before completing');
            }
            const rack = rackNo || wo.rackNo || null;
            if (wo.type === 'MADE_TO_STOCK' && wo.variantId && wo.productId) {
                await inventoryService.applyStockChanges(tx, {
                    branchId: shop.branchId,
                    reason: `Finished goods from work order ${wo.woNumber}`,
                    reference: wo.woNumber,
                    sourceType: StockSourceType.WORK_ORDER,
                    sourceId: wo.id,
                    performedById: actorId,
                    changes: [{variantId: wo.variantId, productId: wo.productId, type: MovementType.PRODUCTION_IN, delta: wo.quantity}],
                });
                if (rack) {
                    await tx.inventory.update({where: {branchId_variantId: {branchId: shop.branchId, variantId: wo.variantId}}, data: {rackNo: rack}});
                }
            }
            await tx.workOrder.update({where: {id}, data: {status: WorkOrderStatus.COMPLETED, completedAt: new Date(), rackNo: rack}});
            return this.shape(await this.load(tx, shop.branchId, id));
        });
    }

    /** Cancel: material still with the job goes back to stock */
    public async cancel(scope: ShopScope, actorId: string, id: string, reason: string) {
        const shop = await this.context(scope);
        return prisma.$transaction(async (tx) => {
            const wo = await this.load(tx, shop.branchId, id);
            if (!OPEN.includes(wo.status)) throw new ApiError(httpStatus.CONFLICT, `A ${wo.status.toLowerCase()} work order cannot be cancelled`);
            const back = wo.materials.filter((m) => m.issuedQty - m.returnedQty > 0);
            if (back.length) {
                await inventoryService.applyStockChanges(tx, {
                    branchId: shop.branchId,
                    reason: `Work order ${wo.woNumber} cancelled`,
                    reference: wo.woNumber,
                    sourceType: StockSourceType.WORK_ORDER,
                    sourceId: wo.id,
                    performedById: actorId,
                    changes: back.map((m) => ({variantId: m.variantId, productId: m.variant.product.id, type: MovementType.PRODUCTION_RETURN, delta: m.issuedQty - m.returnedQty})),
                });
                for (const m of back) await tx.workOrderMaterial.update({where: {id: m.id}, data: {returnedQty: m.issuedQty}});
            }
            await tx.workOrder.update({where: {id}, data: {status: WorkOrderStatus.CANCELLED, cancelReason: reason, materialCost: 0}});
            return this.shape(await this.load(tx, shop.branchId, id));
        });
    }

    /* ------------------------------------------------------------------ bill of materials */

    public async getBom(scope: ShopScope, productId: string) {
        await this.context(scope);
        const product = await prisma.product.findFirst({
            where: {id: productId, shopId: scope.shopId, deletedAt: null},
            select: {
                id: true,
                name: true,
                productKind: true,
                sourcing: true,
                bomLines: {
                    include: {materialVariant: {select: {id: true, variantName: true, finish: true, product: {select: {name: true, unit: true, purchasePrice: true}}}}},
                    orderBy: {createdAt: 'asc'},
                },
            },
        });
        if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
        const cost = product.bomLines.reduce((t, l) => t + l.quantity * (1 + l.wastagePct / 100) * (l.materialVariant.product.purchasePrice ?? 0), 0);
        return {...product, materialCostPerUnit: round2(cost)};
    }

    public async setBom(scope: ShopScope, productId: string, lines: z.infer<typeof v.bomSchema>['lines']) {
        await this.context(scope);
        const product = await prisma.product.findFirst({where: {id: productId, shopId: scope.shopId, deletedAt: null}, select: {id: true, productKind: true}});
        if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
        if (product.productKind !== ProductKind.FINISHED_GOOD) throw new ApiError(httpStatus.BAD_REQUEST, 'A bill of materials is for finished products only');
        await this.rawVariants(prisma, scope, lines.map((l) => l.materialVariantId));
        await prisma.$transaction([
            prisma.bomLine.deleteMany({where: {productId}}),
            prisma.bomLine.createMany({data: lines.map((l) => ({productId, materialVariantId: l.materialVariantId, quantity: l.quantity, wastagePct: l.wastagePct, notes: l.notes ?? null}))}),
        ]);
        return this.getBom(scope, productId);
    }

    /* ------------------------------------------------------------------ racks */

    public async setRack(scope: ShopScope, variantId: string, rackNo?: string) {
        const shop = await billService.shopContext(scope);
        const variant = await prisma.productVariant.findFirst({where: {id: variantId, product: {shopId: scope.shopId}}, select: {id: true}});
        if (!variant) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
        return prisma.inventory.upsert({
            where: {branchId_variantId: {branchId: shop.branchId, variantId}},
            create: {branchId: shop.branchId, variantId, physicalQty: 0, rackNo: rackNo ?? null},
            update: {rackNo: rackNo ?? null},
            select: {variantId: true, rackNo: true},
        });
    }
}

export default new ManufacturingService();
