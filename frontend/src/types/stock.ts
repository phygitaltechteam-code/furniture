export type StockTab = 'STOCK_SUMMARY' | 'LOW_OUT' | 'DAMAGED' | 'SLOW_MOVING';

export type StockPeriod = 'today' | 'this-week' | 'this-month' | 'last-30-days' | 'all-time';

export interface StockMetrics {
  sellablePcs: number;
  sellableItemSizes: number;
  /** Closing x latest purchase cost, over items that have one */
  costValue: number;
  /** In-stock item-sizes with no purchase cost (left out of costValue) */
  withoutCost: number;
  mrpValue: number;
  damagedPcs: number;
  damagedItemSizes: number;
  lowCount: number;
  outCount: number;
  slowCount: number;
  slowDays: number;
}

export interface StockCounts {
  all: number;
  lowOut: number;
  damaged: number;
  slowMoving: number;
}

export interface StockItemRow {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  finish?: string;
  barcode: string;
  opening: number;
  purchase: number;
  sold: number;
  salesReturn: number;
  transfer: number;
  adjust: number;
  /** Manufacturing: raw material issued (-) / returned (+), finished goods in (+) */
  production: number;
  closing: number;
  kind?: StockKind;
  businessLine?: StockLine;
  sourcing?: 'TRADED' | 'MANUFACTURED' | 'MADE_TO_ORDER';
  unit?: string | null;
  rackNo?: string | null;
  available: number;
  costPrice: number | null;
  mrp: number;
  sellingPrice: number;
  valueCost: number | null;
  threshold: number;
  damagedQty: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
  isSlowMoving: boolean;
  daysWithoutSale: number | null;
}

export interface StockSummaryResponse {
  /** Local days, YYYY-MM-DD; from is null for all time */
  period: {from: string | null; to: string};
  metrics: StockMetrics;
  counts: StockCounts;
  items: StockItemRow[];
}

export interface AdjustStockPayload {
  variantId: string;
  type: 'INCREASE' | 'DECREASE' | 'CORRECTION' | 'DAMAGE';
  quantity: number;
  reason: string;
  notes?: string;
}

export interface PhysicalStockCountItem {
  variantId: string;
  systemQty: number;
  countedQty: number;
  reason?: string;
}

export interface PhysicalStockCountPayload {
  notes?: string;
  items: PhysicalStockCountItem[];
}


export type StockKind = 'FINISHED_GOOD' | 'RAW_MATERIAL' | 'HARDWARE';
export type StockLine = 'FURNITURE' | 'ELECTRONICS' | 'CROCKERY';
