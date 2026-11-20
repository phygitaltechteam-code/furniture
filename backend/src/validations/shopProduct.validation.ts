import {z} from 'zod';
import {BusinessLine, ProductKind, ProductStatus, Sourcing} from '@prisma/client';
import {field, hsnCode} from './custom.validation';
import {listQuerySchema} from '../utils/list';
import {productGstRate} from './shopGst.validation';

// Branch products (furniture, electrical, kitchenware, raw materials).
// Price = mrp, selling price = sellingPrice, dealer price = wholesalePrice.
// Every product has one or more variants: a configuration ("3 Seater",
// "King 6x6.5 ft") in a finish ("Walnut", "Grey Fabric").

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const text = (label: string, max: number) => field({label, kind: 'text', max, required: false});
const id = (label: string) =>
    z.string({required_error: `${label} is required`}).uuid(`Select a valid ${label}`);

const money = (label: string, required = false) =>
    z.preprocess(
        (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : emptyToUndefined(v)),
        required
            ? z
                  .number({required_error: `${label} is required`, invalid_type_error: `Enter a valid ${label}`})
                  .positive(`${label} must be more than 0`)
                  .max(99_99_999, `${label} is too large`)
                  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), `${label} can have at most 2 decimals`)
            : z
                  .number({invalid_type_error: `Enter a valid ${label}`})
                  .min(0, `${label} cannot be negative`)
                  .max(99_99_999, `${label} is too large`)
                  .refine((v) => /^\d+(\.\d{1,2})?$/.test(String(v)), `${label} can have at most 2 decimals`)
                  .optional(),
    );

const cm = (label: string) =>
    z.preprocess(
        (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v === '' ? null : v),
        z
            .number({invalid_type_error: `Enter a valid ${label}`})
            .positive(`${label} must be more than 0`)
            .max(5000, `${label} can be at most 5000 cm`)
            .nullable()
            .optional(),
    );

/** Statuses the branch can set directly */
const SHOP_STATUSES = [ProductStatus.DRAFT, ProductStatus.PUBLISHED, ProductStatus.UNPUBLISHED] as const;

export const UNITS = ['PCS', 'SET', 'SQFT', 'RFT', 'KG', 'SHEET', 'LTR', 'MTR'] as const;
export const ROOM_TYPES = ['Living Room', 'Bedroom', 'Dining', 'Office', 'Kitchen', 'Outdoor', 'Kids', 'Other'] as const;

const specification = z.object({
    key: z.string().trim().min(1, 'Name is required').max(40, 'Name is at most 40 characters'),
    value: z.string().trim().min(1, 'Value is required').max(120, 'Value is at most 120 characters'),
});

const variant = z.object({
    /** Existing variant (on edit); omit for a new one */
    id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    variantName: z
        .string({required_error: 'Variant is required'})
        .trim()
        .min(1, 'Variant is required')
        .max(60, 'Variant is at most 60 characters'),
    finish: z
        .string({required_error: 'Finish is required'})
        .trim()
        .min(1, 'Finish is required')
        .max(60, 'Finish is at most 60 characters'),
    mrp: money('Variant Price'),
    sellingPrice: money('Variant Selling Price'),
    wholesalePrice: money('Variant Wholesale Price'),
    /** New variants only: pieces on hand */
    openingStock: z.coerce
        .number({invalid_type_error: 'Enter a valid Opening Stock'})
        .int('Opening Stock must be a whole number')
        .min(0, 'Opening Stock cannot be negative')
        .max(100_000, 'Opening Stock can be at most 100000')
        .default(0),
});

const variants = z
    .array(variant, {required_error: 'Add at least one variant'})
    .min(1, 'Add at least one variant')
    .max(50, 'At most 50 variants')
    .superRefine((list, ctx) => {
        const seen = new Set<string>();
        list.forEach((v, i) => {
            const key = `${v.variantName.toLowerCase()}|${v.finish.toLowerCase()}`;
            if (seen.has(key)) {
                ctx.addIssue({
                    code: 'custom',
                    path: [i, 'variantName'],
                    message: 'This variant and finish is already listed',
                });
            }
            seen.add(key);
        });
    });

const productFields = {
    name: field({label: 'Product Name', kind: 'text', max: 120}),
    sku: z.preprocess(
        emptyToUndefined,
        z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z0-9-]{3,40}$/, 'SKU must be 3-40 letters, numbers or dashes')
            .optional(),
    ),
    shortDesc: text('Short Description', 300),
    detailedDesc: field({label: 'Description', kind: 'text', max: 4000}),
    categoryId: id('Category'),
    subcategoryId: z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().uuid('Select a valid Subcategory').nullable().optional(),
    ),
    brandId: z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().uuid('Select a valid Brand').nullable().optional(),
    ),
    productKind: z.nativeEnum(ProductKind).default(ProductKind.FINISHED_GOOD),
    /** Furniture, Electronics or Crockery (kitchen utensils) */
    businessLine: z.nativeEnum(BusinessLine, {errorMap: () => ({message: 'Choose Furniture, Electronics or Crockery'})}).default(BusinessLine.FURNITURE),
    /** Traded (buy & sell), Manufactured (our workshop, for stock), Made to order */
    sourcing: z.nativeEnum(Sourcing, {errorMap: () => ({message: 'Choose how it is sourced'})}).default(Sourcing.TRADED),
    productType: text('Product Type', 60),
    roomType: z.preprocess(emptyToUndefined, z.enum(ROOM_TYPES).optional()),
    material: text('Material', 60),
    finish: text('Finish', 60),
    colour: text('Colour', 40),
    lengthCm: cm('Length'),
    widthCm: cm('Width'),
    heightCm: cm('Height'),
    specifications: z.array(specification).max(30, 'At most 30 specifications').default([]),
    assemblyRequired: z.boolean().default(false),
    installationAvailable: z.boolean().default(false),
    warrantyMonths: z.coerce
        .number({invalid_type_error: 'Enter valid Warranty months'})
        .int('Warranty must be whole months')
        .min(0, 'Warranty cannot be negative')
        .max(240, 'Warranty can be at most 240 months')
        .default(0),
    warrantyTerms: text('Warranty Terms', 500),
    isCustomizable: z.boolean().default(false),
    unit: z.enum(UNITS).default('PCS'),
    mrp: money('Price (MRP)', true),
    sellingPrice: money('Selling Price'),
    wholesalePrice: money('Wholesale Price'),
    purchasePrice: money('Purchase Cost'),
    status: z.enum(SHOP_STATUSES).default(ProductStatus.DRAFT),
    tags: z.array(z.string().trim().min(1).max(30)).max(15, 'At most 15 tags').default([]),
    careInstructions: text('Care Instructions', 300),
    hsnCode,
    // null = the branch GST rule; a fixed rate must be one of the branch's slabs (checked in the service)
    taxRate: productGstRate.default(null),
};

const priceRule = (
    v: {mrp?: number; sellingPrice?: number; wholesalePrice?: number; businessLine?: BusinessLine; sourcing?: Sourcing; productKind?: ProductKind},
    ctx: z.RefinementCtx,
) => {
    // Only furniture is made in-house; electronics, crockery and raw material are bought in
    if (v.sourcing && v.sourcing !== Sourcing.TRADED && (v.businessLine && v.businessLine !== BusinessLine.FURNITURE)) {
        ctx.addIssue({code: 'custom', path: ['sourcing'], message: 'Electronics and crockery are bought and sold: choose Traded'});
    }
    if (v.sourcing && v.sourcing !== Sourcing.TRADED && v.productKind && v.productKind !== ProductKind.FINISHED_GOOD) {
        ctx.addIssue({code: 'custom', path: ['sourcing'], message: 'Raw material and hardware are bought in: choose Traded'});
    }
    if (v.mrp !== undefined && v.sellingPrice !== undefined && v.sellingPrice > v.mrp) {
        ctx.addIssue({code: 'custom', path: ['sellingPrice'], message: 'Selling Price cannot be more than MRP'});
    }
    if (v.mrp !== undefined && v.wholesalePrice !== undefined && v.wholesalePrice > v.mrp) {
        ctx.addIssue({code: 'custom', path: ['wholesalePrice'], message: 'Wholesale Price cannot be more than MRP'});
    }
};

const createShopProductSchema = z.object({...productFields, variants}).superRefine(priceRule);

// Partial without defaults, so an update never resets fields that were not sent
const updateShopProductSchema = z
    .object({
        ...productFields,
        productKind: z.nativeEnum(ProductKind),
        businessLine: z.nativeEnum(BusinessLine),
        sourcing: z.nativeEnum(Sourcing),
        status: z.enum(SHOP_STATUSES),
        tags: productFields.tags.removeDefault(),
        specifications: productFields.specifications.removeDefault(),
        assemblyRequired: z.boolean(),
        installationAvailable: z.boolean(),
        isCustomizable: z.boolean(),
        warrantyMonths: productFields.warrantyMonths.removeDefault(),
        unit: z.enum(UNITS),
        taxRate: productGstRate,
        variants,
    })
    .partial()
    .superRefine(priceRule);

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

const shopProductListSchema = listQuerySchema(
    ['name', 'sku', 'mrp', 'sellingPrice', 'stock', 'createdAt'] as const,
    'createdAt',
).extend({
    status: z.preprocess(emptyToUndefined, z.nativeEnum(ProductStatus).optional()),
    productKind: z.preprocess(emptyToUndefined, z.nativeEnum(ProductKind).optional()),
    businessLine: z.preprocess(emptyToUndefined, z.nativeEnum(BusinessLine).optional()),
    sourcing: z.preprocess(emptyToUndefined, z.nativeEnum(Sourcing).optional()),
    categoryId: optionalUuid,
    subcategoryId: optionalUuid,
    stock: z.preprocess(emptyToUndefined, z.enum(['in', 'low', 'out']).optional()),
});

const idSchema = z.object({id: z.string().uuid('Invalid ID parameter')});
const imageIdSchema = idSchema.extend({imageId: z.string().uuid('Invalid image ID')});
const imageUpdateSchema = z.object({
    isMain: z.boolean().optional(),
    altText: text('Alt Text', 150),
});

export default {
    createShopProductSchema,
    updateShopProductSchema,
    shopProductListSchema,
    idSchema,
    imageIdSchema,
    imageUpdateSchema,
};
