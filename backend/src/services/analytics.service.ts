import {BillStatus, OrderStatus, Prisma, Role} from '@prisma/client';
import {z} from 'zod';
import prisma from '../client';

/*
 * Business analytics for the dashboards: sales and purchases, the revenue
 * trend, branch / category / product performance, gross profit, low stock,
 * pending deliveries, customer dues and salesperson performance.
 *
 * Scope: the platform (super admin), one company (admin, every branch) or
 * one branch (branch manager / employees). Sales = confirmed counter bills
 * plus online orders that were not cancelled.
 */

export const analyticsQuerySchema = z.object({
    days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d), 'Pick 7, 30, 90 or 365 days').default(30),
});

export type AnalyticsScope = {companyId?: string; branchId?: string};

const round2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

class AnalyticsService {
    public async summary(scope: AnalyticsScope, days: number) {
        const to = new Date();
        const from = new Date(to.getTime() - days * DAY);
        from.setHours(0, 0, 0, 0);
        const prevFrom = new Date(from.getTime() - days * DAY);
        const where = {
            ...(scope.companyId ? {companyId: scope.companyId} : {}),
            ...(scope.branchId ? {branchId: scope.branchId} : {}),
        };
        const bills = {...where, status: BillStatus.CONFIRMED, deletedAt: null};
        const orders = {...where, status: {notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED]}};

        const [
            billRows,
            orderRows,
            prevBills,
            prevOrders,
            purchases,
            billItems,
            orderItems,
            branches,
            dues,
            payables,
            lowStock,
            pendingOrders,
            openQuotes,
            salesmen,
        ] = await Promise.all([
            prisma.salesBill.findMany({
                where: {...bills, billDate: {gte: from}},
                select: {billDate: true, totalAmount: true, taxAmount: true, branchId: true, saleType: true},
            }),
            prisma.order.findMany({
                where: {...orders, createdAt: {gte: from}},
                select: {createdAt: true, totalAmount: true, tax: true, branchId: true},
            }),
            prisma.salesBill.aggregate({where: {...bills, billDate: {gte: prevFrom, lt: from}}, _sum: {totalAmount: true}}),
            prisma.order.aggregate({where: {...orders, createdAt: {gte: prevFrom, lt: from}}, _sum: {totalAmount: true}}),
            prisma.purchaseBill.aggregate({
                where: {...where, status: BillStatus.CONFIRMED, deletedAt: null, billDate: {gte: from}},
                _sum: {totalAmount: true},
                _count: true,
            }),
            prisma.salesBillItem.findMany({
                where: {bill: {...bills, billDate: {gte: from}}},
                select: {
                    productId: true,
                    quantity: true,
                    totalPrice: true,
                    taxRate: true,
                    productName: true,
                    product: {select: {purchasePrice: true, category: {select: {name: true}}}},
                },
            }),
            prisma.orderItem.findMany({
                where: {order: {...orders, createdAt: {gte: from}}},
                select: {
                    productId: true,
                    quantity: true,
                    totalPrice: true,
                    taxRate: true,
                    productName: true,
                    product: {select: {name: true, purchasePrice: true, category: {select: {name: true}}}},
                },
            }),
            prisma.branch.findMany({
                where: {...(scope.companyId ? {companyId: scope.companyId} : {}), ...(scope.branchId ? {id: scope.branchId} : {}), deletedAt: null},
                select: {id: true, name: true, city: true},
            }),
            prisma.shopCustomer.aggregate({where: {...where, balanceDue: {gt: 0}}, _sum: {balanceDue: true}, _count: true}),
            prisma.purchaseBill.aggregate({
                where: {...where, status: BillStatus.CONFIRMED, deletedAt: null, balanceDue: {gt: 0}},
                _sum: {balanceDue: true},
            }),
            prisma.$queryRaw<Array<{n: number}>>`
                SELECT COUNT(*)::int AS n FROM "Inventory" i
                JOIN "Branch" b ON b.id = i."branchId"
                JOIN "ProductVariant" v ON v.id = i."variantId" AND v."isActive"
                WHERE i."physicalQty" - i."reservedQty" <= i.threshold
                  ${scope.companyId ? Prisma.sql`AND b."companyId" = ${scope.companyId}` : Prisma.empty}
                  ${scope.branchId ? Prisma.sql`AND b.id = ${scope.branchId}` : Prisma.empty}`,
            prisma.order.groupBy({
                by: ['status'],
                where: {
                    ...where,
                    status: {in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.READY_FOR_DISPATCH, OrderStatus.DISPATCHED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY]},
                },
                _count: {_all: true},
                orderBy: {status: 'asc'},
            }),
            prisma.quotation.aggregate({
                where: {...where, status: {in: ['DRAFT', 'SENT', 'ACCEPTED']}},
                _sum: {totalAmount: true},
                _count: true,
            }),
            prisma.salesBill.groupBy({
                by: ['salesmanId'],
                where: {...bills, billDate: {gte: from}, salesmanId: {not: null}},
                _sum: {totalAmount: true},
                _count: {_all: true},
                orderBy: {_sum: {totalAmount: 'desc'}},
                take: 5,
            }),
        ]);

        // Revenue by day (counter + online), for the trend chart
        const trend = new Map<string, {counter: number; online: number}>();
        for (let t = from.getTime(); t <= to.getTime(); t += DAY) trend.set(dayKey(new Date(t)), {counter: 0, online: 0});
        for (const b of billRows) {
            const k = dayKey(b.billDate);
            const row = trend.get(k);
            if (row) row.counter += b.totalAmount;
        }
        for (const o of orderRows) {
            const row = trend.get(dayKey(o.createdAt));
            if (row) row.online += o.totalAmount;
        }

        const counterSales = billRows.reduce((t, b) => t + b.totalAmount, 0);
        const onlineSales = orderRows.reduce((t, o) => t + o.totalAmount, 0);
        const wholesale = billRows.filter((b) => b.saleType === 'WHOLESALE').reduce((t, b) => t + b.totalAmount, 0);
        const sales = counterSales + onlineSales;
        const prevSales = (prevBills._sum.totalAmount ?? 0) + (prevOrders._sum.totalAmount ?? 0);

        // Gross profit: net of GST, minus the purchase cost of what was sold
        const lines = [
            ...billItems.map((i) => ({...i, name: i.productName ?? 'Item'})),
            ...orderItems.map((i) => ({...i, name: i.productName ?? i.product.name})),
        ];
        let netRevenue = 0;
        let cost = 0;
        const byProduct = new Map<string, {name: string; qty: number; revenue: number}>();
        const byCategory = new Map<string, number>();
        for (const l of lines) {
            const net = l.totalPrice / (1 + (l.taxRate ?? 0) / 100);
            netRevenue += net;
            cost += (l.product.purchasePrice ?? 0) * l.quantity;
            const p = byProduct.get(l.productId) ?? {name: l.name, qty: 0, revenue: 0};
            p.qty += l.quantity;
            p.revenue += l.totalPrice;
            byProduct.set(l.productId, p);
            const cat = l.product.category?.name ?? 'Other';
            byCategory.set(cat, (byCategory.get(cat) ?? 0) + l.totalPrice);
        }
        const grossProfit = netRevenue - cost;

        // Branch comparison
        const branchSales = new Map<string, number>();
        for (const b of billRows) branchSales.set(b.branchId, (branchSales.get(b.branchId) ?? 0) + b.totalAmount);
        for (const o of orderRows) branchSales.set(o.branchId, (branchSales.get(o.branchId) ?? 0) + o.totalAmount);

        const people = await prisma.user.findMany({
            where: {id: {in: salesmen.map((s) => s.salesmanId!).filter(Boolean)}, role: {not: Role.USER}},
            select: {id: true, fullname: true},
        });
        const nameOf = new Map(people.map((p) => [p.id, p.fullname]));
        const pending = pendingOrders.reduce((t, g) => t + (g._count as {_all: number})._all, 0);

        return {
            period: {days, from, to},
            kpis: {
                sales: round2(sales),
                salesChangePct: prevSales ? Math.round(((sales - prevSales) / prevSales) * 100) : null,
                counterSales: round2(counterSales),
                onlineSales: round2(onlineSales),
                wholesaleSales: round2(wholesale),
                bills: billRows.length,
                orders: orderRows.length,
                avgBill: billRows.length ? round2(counterSales / billRows.length) : 0,
                purchases: round2(purchases._sum.totalAmount ?? 0),
                purchaseBills: purchases._count,
                grossProfit: round2(grossProfit),
                marginPct: netRevenue ? Math.round((grossProfit / netRevenue) * 100) : 0,
                customerDues: round2(dues._sum.balanceDue ?? 0),
                customersOwing: dues._count,
                supplierPayable: round2(payables._sum.balanceDue ?? 0),
                lowStock: lowStock[0]?.n ?? 0,
                pendingOrders: pending,
                openQuotations: openQuotes._count,
                openQuotationValue: round2(openQuotes._sum.totalAmount ?? 0),
            },
            trend: [...trend.entries()].map(([date, v]) => ({date, counter: round2(v.counter), online: round2(v.online)})),
            branches: branches
                .map((b) => ({id: b.id, name: b.name, city: b.city, sales: round2(branchSales.get(b.id) ?? 0)}))
                .sort((a, b) => b.sales - a.sales),
            categories: [...byCategory.entries()]
                .map(([name, revenue]) => ({name, revenue: round2(revenue)}))
                .sort((a, b) => b.revenue - a.revenue),
            topProducts: [...byProduct.values()]
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 8)
                .map((p) => ({...p, revenue: round2(p.revenue)})),
            salespeople: salesmen.map((s) => ({
                name: nameOf.get(s.salesmanId!) ?? 'Staff',
                bills: (s._count as {_all: number})._all,
                sales: round2(s._sum.totalAmount ?? 0),
            })),
            pendingOrdersByStatus: pendingOrders.map((g) => ({status: g.status, count: (g._count as {_all: number})._all})),
        };
    }
}

export default new AnalyticsService();
