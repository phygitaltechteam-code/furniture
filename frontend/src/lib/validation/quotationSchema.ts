import {Quotation, QuotationPayload} from '@/types/quotation';
import {z} from 'zod';
import {field} from './fieldRules';

// Same labels and rules as backend/src/validations/quotation.validation.ts

export const GST_RATES = [0, 5, 12, 18, 28] as const;

const money = (label: string, required = false) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? undefined : Number(v)))
    .refine((v) => (required ? v !== undefined : true), `${label} is required`)
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), `Enter a valid ${label}`)
    .refine((v) => v === undefined || /^\d+(\.\d{1,2})?$/.test(String(v)), `${label} can have at most 2 decimals`);

const itemSchema = z
  .object({
    productId: z.string().optional(),
    variantId: z.string().optional(),
    description: z.string().trim().min(1, 'Item Description is required').max(300, 'At most 300 characters'),
    hsnCode: z
      .string()
      .trim()
      .refine((v) => v === '' || /^(\d{4}|\d{6}|\d{8})$/.test(v), 'HSN must be 4, 6 or 8 digits'),
    quantity: z
      .union([z.string(), z.number()])
      .transform((v) => Number(v))
      .refine((v) => Number.isInteger(v) && v >= 1, 'Quantity must be at least 1')
      .refine((v) => v <= 10_000, 'Quantity is too large'),
    unitPrice: money('Unit Price', true).refine((v) => (v ?? 0) > 0, 'Unit Price must be more than 0'),
    discount: money('Discount'),
    taxRate: z.string(),
  })
  .superRefine((i, ctx) => {
    if ((i.discount ?? 0) > i.quantity * (i.unitPrice ?? 0)) {
      ctx.addIssue({code: 'custom', path: ['discount'], message: 'Discount cannot be more than the line amount'});
    }
  });

export const quotationSchema = z.object({
  customerName: field({label: 'Customer Name', kind: 'name'}),
  customerPhone: field({label: 'Customer Phone', kind: 'phone'}),
  customerEmail: field({label: 'Customer Email', kind: 'email', required: false}),
  customerAddress: field({label: 'Customer Address', kind: 'text', max: 500, required: false}),
  customerGstin: field({label: 'Customer GSTIN', kind: 'gstin', required: false}),
  saleType: z.enum(['RETAIL', 'WHOLESALE']),
  validUntil: z
    .string()
    .min(1, 'Valid Until is required')
    .refine((v) => new Date(v).getTime() >= new Date().setHours(0, 0, 0, 0), 'Valid Until cannot be in the past'),
  extraCharges: money('Delivery / Installation Charges'),
  terms: field({label: 'Terms & Conditions', kind: 'text', max: 2000, required: false}),
  notes: field({label: 'Notes', kind: 'text', max: 1000, required: false}),
  items: z.array(itemSchema).min(1, 'Add at least one item').max(100, 'At most 100 items'),
});

export type QuotationValues = z.input<typeof quotationSchema>;
export type QuotationOutput = z.output<typeof quotationSchema>;

export const EMPTY_ITEM: QuotationValues['items'][number] = {
  productId: '',
  variantId: '',
  description: '',
  hsnCode: '',
  quantity: '1',
  unitPrice: '',
  discount: '',
  taxRate: '18',
};

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

export const DEFAULT_TERMS =
  '50% advance with the order, balance before delivery.\nPrices are valid until the date above.\nFree delivery and installation within city limits.\nMade-to-measure items cannot be returned.';

export const EMPTY_QUOTATION: QuotationValues = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  customerGstin: '',
  saleType: 'RETAIL',
  validUntil: inDays(15),
  extraCharges: '',
  terms: DEFAULT_TERMS,
  notes: '',
  items: [{...EMPTY_ITEM}],
};

export const fromQuotation = (q: Quotation): QuotationValues => ({
  customerName: q.customerName,
  customerPhone: q.customerPhone,
  customerEmail: q.customerEmail ?? '',
  customerAddress: q.customerAddress ?? '',
  customerGstin: q.customerGstin ?? '',
  saleType: q.saleType,
  validUntil: q.validUntil.slice(0, 10),
  extraCharges: q.extraCharges ? String(q.extraCharges) : '',
  terms: q.terms ?? '',
  notes: q.notes ?? '',
  items: q.items.map((i) => ({
    productId: i.productId ?? '',
    variantId: i.variantId ?? '',
    description: i.description,
    hsnCode: i.hsnCode ?? '',
    quantity: String(i.quantity),
    unitPrice: String(i.unitPrice),
    discount: i.discount ? String(i.discount) : '',
    taxRate: String(i.taxRate),
  })),
});

export const toQuotationPayload = (v: QuotationOutput): QuotationPayload => ({
  customerName: v.customerName,
  customerPhone: v.customerPhone,
  customerEmail: v.customerEmail || undefined,
  customerAddress: v.customerAddress || undefined,
  customerGstin: v.customerGstin || undefined,
  saleType: v.saleType,
  validUntil: v.validUntil,
  extraCharges: v.extraCharges ?? 0,
  terms: v.terms || undefined,
  notes: v.notes || undefined,
  items: v.items.map((i) => ({
    productId: i.productId || undefined,
    variantId: i.variantId || undefined,
    description: i.description,
    hsnCode: i.hsnCode || undefined,
    quantity: i.quantity,
    unitPrice: i.unitPrice ?? 0,
    discount: i.discount ?? 0,
    taxRate: Number(i.taxRate),
  })),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Live totals of the form (same maths as the server) */
export const quoteTotals = (items: QuotationValues['items'], extra: unknown) => {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  const lines = items.map((i) => {
    const qty = Number(i.quantity) || 0;
    const price = Number(i.unitPrice) || 0;
    const disc = Number(i.discount) || 0;
    const gross = round2(qty * price);
    const taxable = round2(gross - disc);
    const t = round2((taxable * (Number(i.taxRate) || 0)) / 100);
    subtotal += gross;
    discount += disc;
    tax += t;
    return round2(taxable + t);
  });
  const extraCharges = Number(extra) || 0;
  return {
    lines,
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: round2(tax),
    extraCharges,
    total: round2(subtotal - discount + tax + extraCharges),
  };
};
