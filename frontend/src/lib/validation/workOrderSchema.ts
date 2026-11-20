import {WorkOrder, WorkOrderPayload} from '@/types/manufacturing';
import {z} from 'zod';
import {field} from './fieldRules';

// Same labels and rules as backend/src/validations/manufacturing.validation.ts

const optText = (label: string, max: number) => field({label, kind: 'text', max, required: false});
const num = (label: string, opts: {min?: number; max?: number; int?: boolean; required?: boolean} = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
    .refine((v) => (opts.required ? v !== undefined : true), `${label} is required`)
    .refine((v) => v === undefined || Number.isFinite(v), `Enter a valid ${label}`)
    .refine((v) => v === undefined || !opts.int || Number.isInteger(v), `${label} must be a whole number`)
    .refine((v) => v === undefined || v >= (opts.min ?? 0), opts.min ? `${label} must be at least ${opts.min}` : `${label} cannot be negative`)
    .refine((v) => v === undefined || v <= (opts.max ?? 10_000_000), `${label} is too large`);

const base = z
  .object({
    type: z.enum(['MADE_TO_STOCK', 'MADE_TO_ORDER']),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    productId: z.string(),
    variantId: z.string(),
    title: field({label: 'Item to make', kind: 'text', max: 150}),
    quantity: num('Quantity', {min: 1, max: 1000, int: true, required: true}),

    customerName: field({label: 'Customer Name', kind: 'name', required: false}),
    customerPhone: field({label: 'Customer Phone', kind: 'phone', required: false}),
    customerAddress: optText('Delivery Address', 500),

    category: optText('Category', 80),
    productType: optText('Product Type', 80),
    lengthCm: num('Length', {max: 2000}),
    widthCm: num('Width', {max: 2000}),
    heightCm: num('Height', {max: 2000}),
    sizeNote: optText('Customer Size', 120),
    material: optText('Material', 80),
    finish: optText('Finish', 80),
    colour: optText('Colour', 60),
    accessories: z
      .array(
        z.object({
          name: field({label: 'Accessory', kind: 'text', max: 80}),
          quantity: num('Quantity', {min: 1, max: 100, int: true, required: true}),
          price: num('Price', {required: true}),
        }),
      )
      .max(30, 'At most 30 accessories'),
    designImages: z.array(z.string()).max(8, 'Up to 8 design photos'),
    specNotes: optText('Design Notes', 2000),

    startDate: z.string(),
    dueDate: z.string(),
    assignedToId: z.string(),
    rackNo: optText('Rack No', 40),
    labourCost: num('Labour Cost'),
    overheadCost: num('Overhead Cost'),
    quotedPrice: num('Agreed Price'),
    advancePaid: num('Advance Paid'),
    notes: optText('Notes', 1000),
    materials: z
      .array(z.object({variantId: z.string().min(1, 'Choose a material'), plannedQty: num('Quantity', {min: 1, max: 100_000, int: true, required: true})}))
      .max(100),
  });

/** Cross-field rules, on the raw form values so they show together with the field errors */
const crossRules = (v: z.input<typeof base>, ctx: z.RefinementCtx) => {
    const n = (x: unknown) => (x === '' || x === undefined ? undefined : Number(x));
    if (v.type === 'MADE_TO_ORDER') {
      if (!String(v.customerName ?? '').trim()) ctx.addIssue({code: 'custom', path: ['customerName'], message: 'Customer Name is required for a made-to-order job'});
      if (!String(v.customerPhone ?? '').trim()) ctx.addIssue({code: 'custom', path: ['customerPhone'], message: 'Customer Phone is required for a made-to-order job'});
    }
    if (v.type === 'MADE_TO_STOCK' && !v.variantId) {
      ctx.addIssue({code: 'custom', path: ['variantId'], message: 'Choose the product and variant to make for stock'});
    }
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) {
      ctx.addIssue({code: 'custom', path: ['dueDate'], message: 'Due Date must be on or after the Start Date'});
    }
    const quoted = n(v.quotedPrice);
    if (quoted !== undefined && (n(v.advancePaid) ?? 0) > quoted) {
      ctx.addIssue({code: 'custom', path: ['advancePaid'], message: 'Advance cannot be more than the agreed price'});
    }
    const ids = v.materials.map((m) => m.variantId).filter(Boolean);
    if (new Set(ids).size !== ids.length) ctx.addIssue({code: 'custom', path: ['materials'], message: 'Each raw material can be listed only once'});
};

export type WorkOrderValues = z.input<typeof base>;

export const workOrderSchema = z
  .custom<WorkOrderValues>()
  .superRefine((v, ctx) => {
    const r = base.safeParse(v);
    if (!r.success) for (const issue of r.error.issues) ctx.addIssue(issue as z.IssueData);
    crossRules(v, ctx);
  })
  .transform((v) => base.parse(v));

export const EMPTY_WORK_ORDER: WorkOrderValues = {
  type: 'MADE_TO_STOCK',
  priority: 'NORMAL',
  productId: '',
  variantId: '',
  title: '',
  quantity: '1',
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  category: '',
  productType: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  sizeNote: '',
  material: '',
  finish: '',
  colour: '',
  accessories: [],
  designImages: [],
  specNotes: '',
  startDate: '',
  dueDate: '',
  assignedToId: '',
  rackNo: '',
  labourCost: '',
  overheadCost: '',
  quotedPrice: '',
  advancePaid: '',
  notes: '',
  materials: [],
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const d = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export const fromWorkOrder = (w: WorkOrder): WorkOrderValues => ({
  type: w.type,
  priority: w.priority,
  productId: s(w.productId),
  variantId: s(w.variantId),
  title: w.title,
  quantity: s(w.quantity),
  customerName: s(w.customerName),
  customerPhone: s(w.customerPhone),
  customerAddress: s(w.customerAddress),
  category: s(w.category),
  productType: s(w.productType),
  lengthCm: s(w.lengthCm),
  widthCm: s(w.widthCm),
  heightCm: s(w.heightCm),
  sizeNote: s(w.sizeNote),
  material: s(w.material),
  finish: s(w.finish),
  colour: s(w.colour),
  accessories: w.accessories.map((a) => ({name: a.name, quantity: s(a.quantity), price: s(a.price)})),
  designImages: w.designImages,
  specNotes: s(w.specNotes),
  startDate: d(w.startDate),
  dueDate: d(w.dueDate),
  assignedToId: s(w.assignedTo?.id),
  rackNo: s(w.rackNo),
  labourCost: s(w.labourCost || ''),
  overheadCost: s(w.overheadCost || ''),
  quotedPrice: s(w.quotedPrice),
  advancePaid: s(w.advancePaid || ''),
  notes: s(w.notes),
  materials: w.materials.map((m) => ({variantId: m.variantId, plannedQty: s(m.plannedQty)})),
});

const opt = <T,>(v: T | '' | undefined | null) => (v === '' || v === undefined || v === null ? undefined : v);

/** Form values -> API body (only what the status allows is sent on edit) */
export const toWorkOrderPayload = (v: z.output<typeof workOrderSchema>, materialsLocked: boolean): Partial<WorkOrderPayload> => {
  const mto = v.type === 'MADE_TO_ORDER';
  const body: Partial<WorkOrderPayload> = {
    priority: v.priority,
    title: v.title,
    customerName: mto ? opt(v.customerName) : undefined,
    customerPhone: mto ? opt(v.customerPhone) : undefined,
    customerAddress: mto ? opt(v.customerAddress) : undefined,
    category: opt(v.category),
    productType: opt(v.productType),
    lengthCm: v.lengthCm,
    widthCm: v.widthCm,
    heightCm: v.heightCm,
    sizeNote: opt(v.sizeNote),
    material: opt(v.material),
    finish: opt(v.finish),
    colour: opt(v.colour),
    accessories: v.accessories.map((a) => ({name: a.name, quantity: a.quantity ?? 1, price: a.price ?? 0})),
    designImages: v.designImages,
    specNotes: opt(v.specNotes),
    startDate: opt(v.startDate),
    dueDate: opt(v.dueDate),
    assignedToId: opt(v.assignedToId),
    rackNo: opt(v.rackNo),
    labourCost: v.labourCost ?? 0,
    overheadCost: v.overheadCost ?? 0,
    quotedPrice: mto ? v.quotedPrice : undefined,
    advancePaid: mto ? (v.advancePaid ?? 0) : 0,
    notes: opt(v.notes),
  };
  if (!materialsLocked) {
    Object.assign(body, {
      type: v.type,
      productId: opt(v.productId),
      variantId: opt(v.variantId),
      quantity: v.quantity,
      // Empty list: the server copies the product's bill of materials
      materials: v.materials.length ? v.materials.map((m) => ({variantId: m.variantId, plannedQty: m.plannedQty!})) : undefined,
    });
  }
  return body;
};
