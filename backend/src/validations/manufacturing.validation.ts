import {z} from 'zod';
import {field} from './custom.validation';
import {listQuerySchema} from '../utils/list';

/*
 * Manufacturing (work orders + bill of materials) and deliveries.
 * Same field rules and messages as every other form (custom.validation).
 */

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const text = (label: string, max: number) => field({label, kind: 'text', max, required: false});
const uuid = (label: string) => z.string({required_error: `Select a ${label}`}).uuid(`Select a valid ${label}`);
const optUuid = (label: string) => z.preprocess(emptyToUndefined, z.string().uuid(`Select a valid ${label}`).optional());
const money = (label: string) =>
    z.coerce
        .number({invalid_type_error: `Enter a valid ${label}`})
        .min(0, `${label} cannot be negative`)
        .max(10_000_000, `${label} is too large`)
        .transform((v) => Math.round(v * 100) / 100);
const cm = (label: string) =>
    z.preprocess(
        emptyToUndefined,
        z.coerce.number({invalid_type_error: `Enter ${label} in cm`}).positive(`${label} must be more than 0`).max(2000, `${label} looks too large`).optional(),
    );
const date = (label: string) =>
    z.preprocess(
        (v) => {
            if (v === undefined || v === null || v === '') return undefined;
            const d = new Date(v as string);
            return Number.isNaN(d.getTime()) ? v : d;
        },
        z.date({invalid_type_error: `Enter a valid ${label}`}).optional(),
    );

export const BUSINESS_LINES = ['FURNITURE', 'ELECTRONICS', 'CROCKERY'] as const;
export const SOURCING = ['TRADED', 'MANUFACTURED', 'MADE_TO_ORDER'] as const;
export const WO_TYPES = ['MADE_TO_STOCK', 'MADE_TO_ORDER'] as const;
export const WO_STATUSES = ['PLANNED', 'MATERIAL_ISSUED', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'DELIVERED', 'CANCELLED'] as const;
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

/** Default process (M1): raw material is issued, then these stages, then QC */
export const DEFAULT_STAGES = [
    {key: 'cutting', label: 'Cutting & sizing'},
    {key: 'carpentry', label: 'Carpentry / frame'},
    {key: 'assembly', label: 'Assembly'},
    {key: 'polish', label: 'Polish / finish'},
    {key: 'upholstery', label: 'Upholstery & fitting'},
    {key: 'packing', label: 'Packing'},
] as const;

const accessory = z.object({
    name: field({label: 'Accessory', kind: 'text', max: 80}),
    quantity: z.coerce.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1').max(100).default(1),
    price: money('Accessory Price').default(0),
});

const material = z.object({
    variantId: uuid('raw material'),
    plannedQty: z.coerce.number({invalid_type_error: 'Enter a quantity'}).int('Quantity must be a whole number').min(1, 'Quantity must be at least 1').max(100_000),
});

const workOrderBody = {
    type: z.enum(WO_TYPES, {errorMap: () => ({message: 'Choose made to stock or made to order'})}),
    priority: z.enum(PRIORITIES).default('NORMAL'),
    /** Catalogue item to make; empty for a custom piece */
    productId: optUuid('product'),
    variantId: optUuid('variant'),
    title: field({label: 'Item to make', kind: 'text', max: 150}),
    quantity: z.coerce.number({invalid_type_error: 'Enter a quantity'}).int('Quantity must be a whole number').min(1, 'Quantity must be at least 1').max(1000, 'At most 1000 per work order'),

    customerName: field({label: 'Customer Name', kind: 'name', required: false}),
    customerPhone: field({label: 'Customer Phone', kind: 'phone', required: false}),
    customerAddress: text('Delivery Address', 500),
    orderId: optUuid('online order'),
    salesBillId: optUuid('sales bill'),
    quotationId: optUuid('quotation'),

    category: text('Category', 80),
    productType: text('Product Type', 80),
    lengthCm: cm('Length'),
    widthCm: cm('Width'),
    heightCm: cm('Height'),
    sizeNote: text('Customer Size', 120),
    material: text('Material', 80),
    finish: text('Finish', 80),
    colour: text('Colour', 60),
    accessories: z.array(accessory).max(30, 'At most 30 accessories').default([]),
    designImages: z.array(z.string().trim().max(500)).max(8, 'Up to 8 design photos').default([]),
    specNotes: text('Design Notes', 2000),

    startDate: date('Start Date'),
    dueDate: date('Due Date'),
    assignedToId: optUuid('karigar / supervisor'),
    rackNo: text('Rack No', 40),

    labourCost: money('Labour Cost').default(0),
    overheadCost: money('Overhead Cost').default(0),
    quotedPrice: z.preprocess(emptyToUndefined, money('Agreed Price').optional()),
    advancePaid: money('Advance Paid').default(0),
    notes: text('Notes', 1000),

    /** Raw material; empty = copied from the product's bill of materials */
    materials: z.array(material).max(100).optional(),
};

const woRules = (v: Partial<z.infer<z.ZodObject<typeof workOrderBody>>>, ctx: z.RefinementCtx) => {
    if (v.type === 'MADE_TO_ORDER' && !v.customerName && !v.orderId && !v.salesBillId) {
        ctx.addIssue({code: 'custom', path: ['customerName'], message: 'Customer Name is required for a made-to-order job'});
    }
    if (v.type === 'MADE_TO_ORDER' && v.customerName && !v.customerPhone && !v.orderId && !v.salesBillId) {
        ctx.addIssue({code: 'custom', path: ['customerPhone'], message: 'Customer Phone is required for a made-to-order job'});
    }
    if (v.type === 'MADE_TO_STOCK' && !v.variantId) {
        ctx.addIssue({code: 'custom', path: ['variantId'], message: 'Choose the product and variant to make for stock'});
    }
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) {
        ctx.addIssue({code: 'custom', path: ['dueDate'], message: 'Due Date must be on or after the Start Date'});
    }
    if (v.quotedPrice !== undefined && v.advancePaid !== undefined && v.advancePaid > v.quotedPrice) {
        ctx.addIssue({code: 'custom', path: ['advancePaid'], message: 'Advance cannot be more than the agreed price'});
    }
    const ids = (v.materials ?? []).map((m) => m.variantId);
    if (new Set(ids).size !== ids.length) {
        ctx.addIssue({code: 'custom', path: ['materials'], message: 'Each raw material can be listed only once'});
    }
};

const createWorkOrderSchema = z.object(workOrderBody).superRefine(woRules);
const updateWorkOrderSchema = z.object(workOrderBody).partial().superRefine(woRules);

const listWorkOrdersSchema = listQuerySchema(['createdAt', 'dueDate', 'woNumber'] as const, 'createdAt').extend({
    status: z.preprocess(emptyToUndefined, z.enum(WO_STATUSES).optional()),
    type: z.preprocess(emptyToUndefined, z.enum(WO_TYPES).optional()),
});

/** Issue raw material: every line's remaining quantity, or the given quantities */
const issueSchema = z.object({
    lines: z
        .array(z.object({variantId: uuid('raw material'), quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1')}))
        .max(100)
        .optional(),
});
const returnSchema = z.object({
    lines: z
        .array(z.object({variantId: uuid('raw material'), quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1')}))
        .min(1, 'Choose material to return'),
});
const stageSchema = z.object({
    key: z.string().trim().min(1).max(40),
    done: z.boolean(),
});
const qcSchema = z.object({
    passed: z.boolean({required_error: 'Choose pass or fail'}),
    notes: text('QC Notes', 1000),
});
const completeSchema = z.object({
    rackNo: text('Rack No', 40),
});
const cancelSchema = z.object({
    reason: field({label: 'Reason', kind: 'text', max: 300}),
});

const bomSchema = z
    .object({
        lines: z
            .array(
                z.object({
                    materialVariantId: uuid('raw material'),
                    quantity: z.coerce.number({invalid_type_error: 'Enter a quantity'}).positive('Quantity must be more than 0').max(100_000),
                    wastagePct: z.coerce.number().min(0, 'Wastage cannot be negative').max(100, 'Wastage can be at most 100%').default(0),
                    notes: text('Notes', 200),
                }),
            )
            .max(100, 'At most 100 materials'),
    })
    .superRefine((v, ctx) => {
        const ids = v.lines.map((l) => l.materialVariantId);
        if (new Set(ids).size !== ids.length) ctx.addIssue({code: 'custom', path: ['lines'], message: 'Each raw material can be listed only once'});
    });

/* Deliveries ----------------------------------------------------------------- */

export const DELIVERY_STATUSES = ['SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;

const createDeliverySchema = z
    .object({
        orderId: optUuid('online order'),
        salesBillId: optUuid('sales bill'),
        workOrderId: optUuid('work order'),
        customerName: field({label: 'Customer Name', kind: 'name'}),
        customerPhone: field({label: 'Customer Phone', kind: 'phone'}),
        address: field({label: 'Delivery Address', kind: 'text', max: 500}),
        city: text('City', 60),
        postalCode: field({label: 'Pincode', kind: 'pincode', required: false}),
        items: z
            .array(z.object({name: field({label: 'Item', kind: 'text', max: 150}), quantity: z.coerce.number().int().min(1).max(1000)}))
            .min(1, 'Add at least one item')
            .max(50),
        scheduledDate: z.preprocess(
            (v) => (v === undefined || v === '' ? undefined : new Date(v as string)),
            z.date({required_error: 'Delivery Date is required', invalid_type_error: 'Enter a valid Delivery Date'}),
        ),
        slot: z.preprocess(emptyToUndefined, z.enum(['MORNING', 'AFTERNOON', 'EVENING']).optional()),
        installation: z.boolean().default(false),
        assignedToId: optUuid('delivery person'),
        notes: text('Notes', 500),
    })
    .superRefine((v, ctx) => {
        if (v.scheduledDate && v.scheduledDate.getTime() < new Date().setHours(0, 0, 0, 0)) {
            ctx.addIssue({code: 'custom', path: ['scheduledDate'], message: 'Delivery Date cannot be in the past'});
        }
    });

const deliveryStatusSchema = z
    .object({
        status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'], {errorMap: () => ({message: 'Choose a status'})}),
        outcomeNote: text('Note', 300),
    })
    .superRefine((v, ctx) => {
        if ((v.status === 'FAILED' || v.status === 'CANCELLED') && !v.outcomeNote) {
            ctx.addIssue({code: 'custom', path: ['outcomeNote'], message: 'Tell us why'});
        }
    });
const assignSchema = z.object({assignedToId: optUuid('delivery person'), scheduledDate: date('Delivery Date'), slot: z.preprocess(emptyToUndefined, z.enum(['MORNING', 'AFTERNOON', 'EVENING']).optional())});

const listDeliveriesSchema = listQuerySchema(['scheduledDate', 'createdAt'] as const, 'scheduledDate').extend({
    status: z.preprocess(emptyToUndefined, z.enum(DELIVERY_STATUSES).optional()),
    day: z.preprocess(emptyToUndefined, z.enum(['today', 'upcoming', 'overdue']).optional()),
});

const rackSchema = z.object({rackNo: text('Rack No', 40)});
const idSchema = z.object({id: z.string().uuid('Invalid ID parameter')});
const variantIdSchema = z.object({variantId: z.string().uuid('Invalid ID parameter')});

export default {
    createWorkOrderSchema,
    updateWorkOrderSchema,
    listWorkOrdersSchema,
    issueSchema,
    returnSchema,
    stageSchema,
    qcSchema,
    completeSchema,
    cancelSchema,
    bomSchema,
    createDeliverySchema,
    deliveryStatusSchema,
    assignSchema,
    listDeliveriesSchema,
    rackSchema,
    idSchema,
    variantIdSchema,
};
