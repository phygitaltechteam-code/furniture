export type WorkOrderType = 'MADE_TO_STOCK' | 'MADE_TO_ORDER';
export type WorkOrderStatus = 'PLANNED' | 'MATERIAL_ISSUED' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type BusinessLine = 'FURNITURE' | 'ELECTRONICS' | 'CROCKERY';
export type Sourcing = 'TRADED' | 'MANUFACTURED' | 'MADE_TO_ORDER';

export const BUSINESS_LINE_LABEL: Record<BusinessLine, string> = {
  FURNITURE: 'Furniture',
  ELECTRONICS: 'Electronics',
  CROCKERY: 'Crockery & utensils',
};
export const SOURCING_LABEL: Record<Sourcing, string> = {
  TRADED: 'Traded (buy & sell)',
  MANUFACTURED: 'Manufactured (our workshop)',
  MADE_TO_ORDER: 'Made to order',
};
export const SOURCING_SHORT: Record<Sourcing, string> = {TRADED: 'Traded', MANUFACTURED: 'Manufactured', MADE_TO_ORDER: 'Made to order'};

export const WO_TYPE_LABEL: Record<WorkOrderType, string> = {MADE_TO_STOCK: 'For stock', MADE_TO_ORDER: 'Customer order'};

export const WO_STATUS: Record<WorkOrderStatus, {label: string; cls: string}> = {
  PLANNED: {label: 'Planned', cls: 'bg-ivory-200 text-on-surface-variant'},
  MATERIAL_ISSUED: {label: 'Material issued', cls: 'bg-[#E4E9F4] text-[#2F4A7A]'},
  IN_PROGRESS: {label: 'In production', cls: 'bg-brass-soft text-brass-deep'},
  QUALITY_CHECK: {label: 'Quality check', cls: 'bg-[#F3E8FF] text-[#6B21A8]'},
  COMPLETED: {label: 'Completed', cls: 'bg-secondary-container text-on-secondary-container'},
  DELIVERED: {label: 'Delivered', cls: 'bg-secondary-container text-on-secondary-container'},
  CANCELLED: {label: 'Cancelled', cls: 'bg-error-container text-on-error-container'},
};

export const PRIORITY: Record<Priority, {label: string; cls: string}> = {
  LOW: {label: 'Low', cls: 'text-outline'},
  NORMAL: {label: 'Normal', cls: 'text-on-surface-variant'},
  HIGH: {label: 'High', cls: 'text-brass-deep'},
  URGENT: {label: 'Urgent', cls: 'text-error'},
};

export interface Stage {
  key: string;
  label: string;
  done: boolean;
  at: string | null;
  by: string | null;
}
export interface Accessory {
  name: string;
  quantity: number;
  price: number;
}
export interface Costing {
  material: number;
  accessories: number;
  labour: number;
  overhead: number;
  total: number;
  perUnit: number;
  margin: number | null;
}

export interface WorkOrderListItem {
  id: string;
  woNumber: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: Priority;
  title: string;
  quantity: number;
  customerName: string | null;
  customerPhone: string | null;
  dueDate: string | null;
  rackNo: string | null;
  createdAt: string;
  progress: number;
  overdue: boolean;
  cost: Costing;
  assignedTo: {id: string; fullname: string} | null;
  variant: {variantName: string; finish: string} | null;
  product: {images: {url: string}[]} | null;
}

export interface WorkOrderMaterial {
  id: string;
  variantId: string;
  plannedQty: number;
  issuedQty: number;
  returnedQty: number;
  unitCost: number;
  inStock: number;
  rackNo: string | null;
  toIssue: number;
  variant: {
    id: string;
    variantName: string;
    finish: string;
    variantSku: string;
    product: {id: string; name: string; unit: string | null; purchasePrice: number | null; productKind: string};
  };
}

export interface WorkOrder extends Omit<WorkOrderListItem, 'product'> {
  productId: string | null;
  variantId: string | null;
  customerAddress: string | null;
  orderId: string | null;
  salesBillId: string | null;
  category: string | null;
  productType: string | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  sizeNote: string | null;
  material: string | null;
  finish: string | null;
  colour: string | null;
  accessories: Accessory[];
  designImages: string[];
  specNotes: string | null;
  startDate: string | null;
  labourCost: number;
  overheadCost: number;
  materialCost: number;
  quotedPrice: number | null;
  advancePaid: number;
  qcPassed: boolean | null;
  qcNotes: string | null;
  completedAt: string | null;
  deliveredAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  stages: Stage[];
  materials: WorkOrderMaterial[];
  product: {id: string; name: string; sku: string; unit: string | null; sourcing: Sourcing; images: {url: string}[]} | null;
  order: {id: string; orderNumber: string; status: string} | null;
  salesBill: {id: string; billNumber: string; totalAmount: number} | null;
  deliveries: {id: string; deliveryNumber: string; status: DeliveryStatus; scheduledDate: string; deliveredAt: string | null}[];
}

export interface WorkOrderOptions {
  stages: {key: string; label: string}[];
  finished: {
    id: string;
    name: string;
    sku: string;
    sourcing: Sourcing;
    hasBom: boolean;
    productType: string | null;
    material: string | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    category: {name: string};
    variants: {id: string; variantName: string; finish: string}[];
  }[];
  raw: {variantId: string; name: string; variantName: string; finish: string; unit: string | null; kind: string; cost: number; inStock: number; rackNo: string | null}[];
  team: {id: string; fullname: string; role: string; department: string | null}[];
}

export interface WorkOrderPayload {
  type: WorkOrderType;
  priority: Priority;
  productId?: string;
  variantId?: string;
  title: string;
  quantity: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  category?: string;
  productType?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  sizeNote?: string;
  material?: string;
  finish?: string;
  colour?: string;
  accessories: Accessory[];
  designImages: string[];
  specNotes?: string;
  startDate?: string;
  dueDate?: string;
  assignedToId?: string;
  rackNo?: string;
  labourCost: number;
  overheadCost: number;
  quotedPrice?: number;
  advancePaid: number;
  notes?: string;
  materials?: {variantId: string; plannedQty: number}[];
}

export interface Bom {
  id: string;
  name: string;
  productKind: string;
  sourcing: Sourcing;
  materialCostPerUnit: number;
  bomLines: {
    id: string;
    materialVariantId: string;
    quantity: number;
    wastagePct: number;
    notes: string | null;
    materialVariant: {id: string; variantName: string; finish: string; product: {name: string; unit: string | null; purchasePrice: number | null}};
  }[];
}

/* Deliveries */

export type DeliveryStatus = 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type Slot = 'MORNING' | 'AFTERNOON' | 'EVENING';

export const DELIVERY_STATUS: Record<DeliveryStatus, {label: string; cls: string}> = {
  SCHEDULED: {label: 'Scheduled', cls: 'bg-ivory-200 text-on-surface-variant'},
  OUT_FOR_DELIVERY: {label: 'Out for delivery', cls: 'bg-brass-soft text-brass-deep'},
  DELIVERED: {label: 'Delivered', cls: 'bg-secondary-container text-on-secondary-container'},
  FAILED: {label: 'Failed', cls: 'bg-error-container text-on-error-container'},
  CANCELLED: {label: 'Cancelled', cls: 'bg-ivory-200 text-outline'},
};
export const SLOT_LABEL: Record<Slot, string> = {MORNING: 'Morning (9–12)', AFTERNOON: 'Afternoon (12–4)', EVENING: 'Evening (4–8)'};

export interface Delivery {
  id: string;
  deliveryNumber: string;
  orderId: string | null;
  salesBillId: string | null;
  workOrderId: string | null;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string | null;
  postalCode: string | null;
  items: {name: string; quantity: number}[];
  scheduledDate: string;
  slot: Slot | null;
  installation: boolean;
  status: DeliveryStatus;
  notes: string | null;
  outcomeNote: string | null;
  deliveredAt: string | null;
  createdAt: string;
  assignedTo: {id: string; fullname: string; phoneNumber: string} | null;
  order: {id: string; orderNumber: string} | null;
  salesBill: {id: string; billNumber: string} | null;
  workOrder: {id: string; woNumber: string; title: string} | null;
}

export interface DeliveryPayload {
  orderId?: string;
  salesBillId?: string;
  workOrderId?: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city?: string;
  postalCode?: string;
  items: {name: string; quantity: number}[];
  scheduledDate: string;
  slot?: Slot;
  installation: boolean;
  assignedToId?: string;
  notes?: string;
}

export type Paged<T, S> = {
  items: T[];
  pagination: {page: number; limit: number; total: number; totalPages: number};
  summary: S;
};
export type WorkOrderSummary = {byStatus: Partial<Record<WorkOrderStatus, number>>; overdue: number};
export type DeliverySummary = {byStatus: Partial<Record<DeliveryStatus, number>>; today: number; overdue: number};
