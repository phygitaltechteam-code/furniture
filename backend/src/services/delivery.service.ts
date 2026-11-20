import httpStatus from 'http-status';
import {DeliveryStatus, OrderStatus, Prisma, Role, WorkOrderStatus} from '@prisma/client';
import {z} from 'zod';
import prisma from '../client';
import ApiError from '@utils/ApiError';
import {listArgs, toListResult} from '../utils/list';
import v from '../validations/manufacturing.validation';
import accountService from './account.service';
import billService from './bill.service';
import {ShopScope} from './shopProduct.service';

/*
 * Deliveries of a branch: what goes out to customers (online orders, counter
 * bills with home delivery, finished made-to-order work orders), who takes it,
 * when, and whether it was installed.
 *
 *   SCHEDULED -> OUT_FOR_DELIVERY -> DELIVERED       (or FAILED / CANCELLED)
 *
 * Delivering closes the source: a made-to-order work order becomes DELIVERED,
 * an online order becomes DELIVERED.
 */

type CreateDelivery = z.infer<typeof v.createDeliverySchema>;
type ListDeliveries = z.infer<typeof v.listDeliveriesSchema>;

const fy = (d = new Date()) => {
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ACTIVE: DeliveryStatus[] = [DeliveryStatus.SCHEDULED, DeliveryStatus.OUT_FOR_DELIVERY];

const INCLUDE = {
    assignedTo: {select: {id: true, fullname: true, phoneNumber: true}},
    order: {select: {id: true, orderNumber: true}},
    salesBill: {select: {id: true, billNumber: true}},
    workOrder: {select: {id: true, woNumber: true, title: true}},
} satisfies Prisma.DeliveryInclude;

class DeliveryService {
    private async load(branchId: string, id: string) {
        const d = await prisma.delivery.findFirst({where: {id, branchId}, include: INCLUDE});
        if (!d) throw new ApiError(httpStatus.NOT_FOUND, 'Delivery not found');
        return d;
    }

    public async list(scope: ShopScope, q: ListDeliveries) {
        const shop = await billService.shopContext(scope);
        const today = startOfDay();
        const tomorrow = new Date(today.getTime() + 86_400_000);
        const term = q.search.trim();
        const where: Prisma.DeliveryWhereInput = {
            branchId: shop.branchId,
            ...(q.status ? {status: q.status} : {}),
            ...(q.day === 'today' ? {scheduledDate: {gte: today, lt: tomorrow}} : {}),
            ...(q.day === 'upcoming' ? {scheduledDate: {gte: tomorrow}, status: {in: ACTIVE}} : {}),
            ...(q.day === 'overdue' ? {scheduledDate: {lt: today}, status: {in: ACTIVE}} : {}),
            ...(term
                ? {
                      OR: [
                          {deliveryNumber: {contains: term, mode: 'insensitive'}},
                          {customerName: {contains: term, mode: 'insensitive'}},
                          {customerPhone: {contains: term}},
                          {city: {contains: term, mode: 'insensitive'}},
                      ],
                  }
                : {}),
        };
        const [items, total, byStatus, todayCount, overdue] = await Promise.all([
            prisma.delivery.findMany({where, include: INCLUDE, ...listArgs(q)}),
            prisma.delivery.count({where}),
            prisma.delivery.groupBy({by: ['status'], where: {branchId: shop.branchId}, _count: {_all: true}}),
            prisma.delivery.count({where: {branchId: shop.branchId, scheduledDate: {gte: today, lt: tomorrow}, status: {in: ACTIVE}}}),
            prisma.delivery.count({where: {branchId: shop.branchId, scheduledDate: {lt: today}, status: {in: ACTIVE}}}),
        ]);
        return {
            ...toListResult(items, total, q),
            summary: {
                byStatus: Object.fromEntries(byStatus.map((g) => [g.status, (g._count as {_all: number})._all])),
                today: todayCount,
                overdue,
            },
        };
    }

    public async get(scope: ShopScope, id: string) {
        const shop = await billService.shopContext(scope);
        return this.load(shop.branchId, id);
    }

    /** People of the branch who can take deliveries */
    public async team(scope: ShopScope) {
        const shop = await billService.shopContext(scope);
        return prisma.user.findMany({
            where: {branchId: shop.branchId, deletedAt: null, status: 'ACTIVE', role: {in: [Role.BRANCH_MANAGER, Role.EMPLOYEE]}},
            select: {id: true, fullname: true, phoneNumber: true, department: true},
            orderBy: {fullname: 'asc'},
        });
    }

    public async create(scope: ShopScope, actorId: string, data: CreateDelivery) {
        const shop = await billService.shopContext(scope);
        const branchId = shop.branchId;
        // Linked documents must be of this branch
        if (data.orderId && !(await prisma.order.findFirst({where: {id: data.orderId, branchId}, select: {id: true}}))) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Online order not found in this branch', [{field: 'orderId', message: 'Order not found'}]);
        }
        if (data.salesBillId && !(await prisma.salesBill.findFirst({where: {id: data.salesBillId, branchId, deletedAt: null}, select: {id: true}}))) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Sales bill not found in this branch', [{field: 'salesBillId', message: 'Bill not found'}]);
        }
        if (data.workOrderId) {
            const wo = await prisma.workOrder.findFirst({where: {id: data.workOrderId, branchId}, select: {status: true, type: true}});
            if (!wo) throw new ApiError(httpStatus.BAD_REQUEST, 'Work order not found in this branch', [{field: 'workOrderId', message: 'Work order not found'}]);
            if (wo.status !== WorkOrderStatus.COMPLETED) {
                throw new ApiError(httpStatus.CONFLICT, 'Complete the work order (QC passed) before scheduling its delivery');
            }
        }
        if (data.assignedToId && !(await prisma.user.findFirst({where: {id: data.assignedToId, branchId, deletedAt: null}, select: {id: true}}))) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a person from this branch', [{field: 'assignedToId', message: 'Not in this branch'}]);
        }
        return accountService.withRetry(
            () =>
                prisma.$transaction(async (tx) => {
                    const prefix = `DL/${shop.billPrefix || shop.code}/${fy()}/`;
                    const deliveryNumber = await accountService.nextCode(tx, prefix, 4, async (p) =>
                        (await tx.delivery.findMany({where: {branchId, deliveryNumber: {startsWith: p}}, select: {deliveryNumber: true}})).map((d) => d.deliveryNumber),
                    );
                    const created = await tx.delivery.create({
                        data: {
                            ...data,
                            items: data.items as Prisma.InputJsonValue,
                            deliveryNumber,
                            companyId: shop.companyId,
                            branchId,
                            createdById: actorId,
                        },
                        include: INCLUDE,
                    });
                    return created;
                }),
            'deliveryNumber',
        );
    }

    public async assign(scope: ShopScope, id: string, data: z.infer<typeof v.assignSchema>) {
        const shop = await billService.shopContext(scope);
        const d = await this.load(shop.branchId, id);
        if (!ACTIVE.includes(d.status)) throw new ApiError(httpStatus.CONFLICT, 'This delivery is closed');
        if (data.assignedToId && !(await prisma.user.findFirst({where: {id: data.assignedToId, branchId: shop.branchId, deletedAt: null}, select: {id: true}}))) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a person from this branch', [{field: 'assignedToId', message: 'Not in this branch'}]);
        }
        await prisma.delivery.update({
            where: {id},
            data: {
                assignedToId: data.assignedToId ?? null,
                ...(data.scheduledDate ? {scheduledDate: data.scheduledDate} : {}),
                ...(data.slot ? {slot: data.slot} : {}),
            },
        });
        return this.load(shop.branchId, id);
    }

    public async setStatus(scope: ShopScope, actorId: string, id: string, data: z.infer<typeof v.deliveryStatusSchema>) {
        const shop = await billService.shopContext(scope);
        const d = await this.load(shop.branchId, id);
        if (!ACTIVE.includes(d.status)) throw new ApiError(httpStatus.CONFLICT, `This delivery is already ${d.status.toLowerCase().replace(/_/g, ' ')}`);
        if (data.status === 'OUT_FOR_DELIVERY' && d.status !== DeliveryStatus.SCHEDULED) {
            throw new ApiError(httpStatus.CONFLICT, 'It is already out for delivery');
        }
        const delivered = data.status === 'DELIVERED';
        await prisma.$transaction(async (tx) => {
            await tx.delivery.update({
                where: {id},
                data: {status: data.status, outcomeNote: data.outcomeNote ?? null, deliveredAt: delivered ? new Date() : null},
            });
            if (delivered && d.workOrderId) {
                await tx.workOrder.updateMany({
                    where: {id: d.workOrderId, status: WorkOrderStatus.COMPLETED},
                    data: {status: WorkOrderStatus.DELIVERED, deliveredAt: new Date()},
                });
            }
            if (delivered && d.orderId) {
                const o = await tx.order.findUnique({where: {id: d.orderId}, select: {status: true}});
                if (o && o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.RETURNED) {
                    await tx.order.update({where: {id: d.orderId}, data: {status: OrderStatus.DELIVERED}});
                    await tx.orderStatusHistory.create({
                        data: {orderId: d.orderId, status: OrderStatus.DELIVERED, comment: `Delivered by our team (${d.deliveryNumber})`, updatedById: actorId},
                    });
                }
            }
        });
        return this.load(shop.branchId, id);
    }
}

export default new DeliveryService();
