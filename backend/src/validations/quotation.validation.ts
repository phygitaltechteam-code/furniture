import {z} from 'zod';
import {field} from './custom.validation';
import {listQuerySchema} from '../utils/list';

// Quotations: a priced offer to a customer, later converted into a sales bill.
// Totals are always recomputed on the server.

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const text = (label: string, max: number) => field({label, kind: 'text', max, required: false});
const money = (label: string) =>
    z.coerce
        .number({invalid_type_error: `Enter a valid ${label}`})
        .min(0, `${label} cannot be negative`)
        .max(10_000_000, `${label} is too large`)
        .transform((v) => Math.round(v * 100) / 100);

export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED'] as const;
export const GST_RATES = [0, 5, 12, 18, 28] as const;

const item = z
    .object({
        /** Catalog item; leave both empty for a custom (made-to-measure) line */
        productId: z.preprocess(emptyToUndefined, z.string().uuid('Select a valid product').optional()),
        variantId: z.preprocess(emptyToUndefined, z.string().uuid('Select a valid variant').optional()),
        description: field({label: 'Item Description', kind: 'text', max: 300}),
        hsnCode: z.preprocess(
            emptyToUndefined,
            z
                .string()
                .trim()
                .regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN must be 4, 6 or 8 digits')
                .optional(),
        ),
        quantity: z.coerce
            .number({invalid_type_error: 'Enter a valid Quantity'})
            .int('Quantity must be a whole number')
            .min(1, 'Quantity must be at least 1')
            .max(10_000, 'Quantity is too large'),
        unitPrice: money('Unit Price').refine((v) => v > 0, 'Unit Price must be more than 0'),
        discount: money('Item Discount').default(0),
        taxRate: z.coerce
            .number({invalid_type_error: 'Select a GST rate'})
            .refine((v) => (GST_RATES as readonly number[]).includes(v), 'Select 0, 5, 12, 18 or 28% GST')
            .default(18),
    })
    .superRefine((i, ctx) => {
        if (i.variantId && !i.productId) {
            ctx.addIssue({code: 'custom', path: ['productId'], message: 'Select the product of this variant'});
        }
        if (i.discount > i.quantity * i.unitPrice) {
            ctx.addIssue({code: 'custom', path: ['discount'], message: 'Discount cannot be more than the line amount'});
        }
    });

const quotationBody = {
    customerName: field({label: 'Customer Name', kind: 'name'}),
    customerPhone: field({label: 'Customer Phone', kind: 'phone'}),
    customerEmail: field({label: 'Customer Email', kind: 'email', required: false}),
    customerAddress: text('Customer Address', 500),
    customerGstin: field({label: 'Customer GSTIN', kind: 'gstin', required: false}),
    saleType: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
    // Coercing undefined gives an Invalid Date, so a missing date says "required" first
    validUntil: z.preprocess(
        (v) => {
            if (v === undefined || v === null || v === '') return undefined;
            const d = new Date(v as string);
            // Left as the raw value so it fails as "not a date" with our message
            return Number.isNaN(d.getTime()) ? v : d;
        },
        z
            .date({required_error: 'Valid Until is required', invalid_type_error: 'Enter a valid Valid Until date'})
            .refine((d) => d.getTime() >= new Date().setHours(0, 0, 0, 0), 'Valid Until cannot be in the past'),
    ),
    extraCharges: money('Delivery / Installation Charges').default(0),
    terms: text('Terms & Conditions', 2000),
    notes: text('Notes', 1000),
    items: z
        .array(item, {required_error: 'Add at least one item'})
        .min(1, 'Add at least one item')
        .max(100, 'At most 100 items per quotation'),
};

const createQuotationSchema = z.object(quotationBody);
const updateQuotationSchema = z.object(quotationBody).partial();

const statusSchema = z.object({
    status: z.enum(['SENT', 'ACCEPTED', 'REJECTED'], {
        errorMap: () => ({message: 'Choose Sent, Accepted or Rejected'}),
    }),
});

const listSchema = listQuerySchema(['createdAt', 'quoteDate', 'totalAmount', 'customerName'] as const, 'createdAt').extend({
    status: z.preprocess(emptyToUndefined, z.enum(QUOTATION_STATUSES).optional()),
});

const idSchema = z.object({id: z.string().uuid('Invalid ID parameter')});

export default {createQuotationSchema, updateQuotationSchema, statusSchema, listSchema, idSchema};
