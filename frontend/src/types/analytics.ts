export type AnalyticsDays = 7 | 30 | 90 | 365;

export interface Analytics {
  period: {days: number; from: string; to: string};
  kpis: {
    sales: number;
    salesChangePct: number | null;
    counterSales: number;
    onlineSales: number;
    wholesaleSales: number;
    bills: number;
    orders: number;
    avgBill: number;
    purchases: number;
    purchaseBills: number;
    grossProfit: number;
    marginPct: number;
    customerDues: number;
    customersOwing: number;
    supplierPayable: number;
    lowStock: number;
    pendingOrders: number;
    openQuotations: number;
    openQuotationValue: number;
  };
  trend: {date: string; counter: number; online: number}[];
  branches: {id: string; name: string; city: string; sales: number}[];
  categories: {name: string; revenue: number}[];
  topProducts: {name: string; qty: number; revenue: number}[];
  salespeople: {name: string; bills: number; sales: number}[];
  pendingOrdersByStatus: {status: string; count: number}[];
}

export interface LimitRow {
  limit: number;
  used: number;
  left: number;
}

export interface PlanLimits {
  branches: LimitRow;
  employees: LimitRow;
  products: LimitRow;
  ecommerceEnabled: boolean;
  manufacturingEnabled: boolean;
}
