export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
export type SaleType = 'RETAIL' | 'WHOLESALE';

export const QUOTATION_STATUS: Record<QuotationStatus, {label: string; cls: string}> = {
  DRAFT: {label: 'Draft', cls: 'bg-ivory-200 text-on-surface-variant'},
  SENT: {label: 'Sent', cls: 'bg-[#E4E9F4] text-[#2F4A7A]'},
  ACCEPTED: {label: 'Accepted', cls: 'bg-brass-soft text-brass-deep'},
  REJECTED: {label: 'Rejected', cls: 'bg-error-container text-on-error-container'},
  CONVERTED: {label: 'Billed', cls: 'bg-secondary-container text-on-secondary-container'},
};

export interface QuotationItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  description: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  totalPrice: number;
  product?: {id: string; name: string; sku: string; images: {url: string}[]} | null;
  variant?: {id: string; variantSku: string; variantName: string; finish: string} | null;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerAddress: string | null;
  customerGstin: string | null;
  saleType: SaleType;
  quoteDate: string;
  validUntil: string;
  status: QuotationStatus;
  subtotal: number;
  discount: number;
  taxAmount: number;
  extraCharges: number;
  totalAmount: number;
  terms: string | null;
  notes: string | null;
  createdAt: string;
  items: QuotationItem[];
  salesBill: {id: string; billNumber: string; totalAmount: number} | null;
  shop: {
    name: string;
    gstin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    branch: {name: string; city: string; state: string};
    company: {name: string; logo: string | null};
  };
}

export interface QuotationListItem {
  id: string;
  quotationNumber: string;
  customerName: string;
  customerPhone: string;
  saleType: SaleType;
  quoteDate: string;
  validUntil: string;
  status: QuotationStatus;
  totalAmount: number;
  itemCount: number;
  expired: boolean;
  salesBill: {id: string; billNumber: string} | null;
}

export type QuotationSummary = Partial<Record<QuotationStatus, {count: number; value: number}>>;

export interface QuotationPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGstin?: string;
  saleType: SaleType;
  validUntil: string;
  extraCharges: number;
  terms?: string;
  notes?: string;
  items: {
    productId?: string;
    variantId?: string;
    description: string;
    hsnCode?: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
  }[];
}

export interface QuotationBillDraft {
  quotationId: string;
  quotationNumber: string;
  saleType: SaleType;
  customerName: string;
  customerPhone: string;
  customerGstin: string | null;
  items: {
    variantId: string;
    productId: string;
    name: string;
    variantName: string;
    finish: string;
    quantity: number;
    unitPrice: number;
  }[];
  customLines: {description: string; quantity: number; totalPrice: number}[];
}
