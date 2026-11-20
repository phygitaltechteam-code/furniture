import {AUTO_RATE} from '@/lib/api/gst';
import {ShopProduct} from '@/types/shopProduct';
import {z} from 'zod';
import {field} from './fieldRules';

// Same labels and rules as backend/src/validations/shopProduct.validation.ts.
// MRP = mrp, Selling Price = sellingPrice, Wholesale = wholesalePrice.
// SKU is optional: the backend generates one when it is left blank.

const text = (label: string, max: number) =>
  field({label, kind: 'text', max, required: false});

const money = (label: string) => field({label, kind: 'price', required: false});

/** Optional size in cm: blank, or a number above 0 */
const cm = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null ? undefined : Number(v)))
    .refine(
      (v) => v === undefined || (Number.isFinite(v) && v > 0 && v <= 5000),
      `${label} must be between 0 and 5000 cm`,
    );

export const PRODUCT_KINDS = [
  {value: 'FINISHED_GOOD', label: 'Finished product (for sale)'},
  {value: 'RAW_MATERIAL', label: 'Raw material'},
  {value: 'HARDWARE', label: 'Hardware / accessory'},
  {value: 'SERVICE', label: 'Service (installation, polish…)'},
] as const;

export const ROOM_TYPES = [
  'Living Room',
  'Bedroom',
  'Dining',
  'Office',
  'Kitchen',
  'Outdoor',
  'Kids',
  'Other',
] as const;

export const UNITS = [
  {value: 'PCS', label: 'Piece (PCS)'},
  {value: 'SET', label: 'Set'},
  {value: 'SQFT', label: 'Square foot (SQFT)'},
  {value: 'RFT', label: 'Running foot (RFT)'},
  {value: 'SHEET', label: 'Sheet'},
  {value: 'KG', label: 'Kilogram (KG)'},
  {value: 'LTR', label: 'Litre (LTR)'},
  {value: 'MTR', label: 'Metre (MTR)'},
] as const;

const variantRow = z
  .object({
    /** Saved variant (edit); blank for a new row */
    id: z.string().optional(),
    variantName: z
      .string()
      .trim()
      .min(1, 'Variant is required')
      .max(60, 'At most 60 characters'),
    finish: z
      .string()
      .trim()
      .min(1, 'Finish is required')
      .max(60, 'At most 60 characters'),
    mrp: money('Variant MRP'),
    sellingPrice: money('Variant Price'),
    wholesalePrice: money('Variant Wholesale'),
    openingStock: field({label: 'Opening Stock', kind: 'quantity', required: false}),
  })
  .superRefine((v, ctx) => {
    if (v.mrp !== undefined && v.sellingPrice !== undefined && v.sellingPrice > v.mrp) {
      ctx.addIssue({code: 'custom', path: ['sellingPrice'], message: 'Price cannot be more than MRP'});
    }
  });

const specRow = z.object({
  key: z.string().trim().min(1, 'Name is required').max(40, 'At most 40 characters'),
  value: z.string().trim().min(1, 'Value is required').max(120, 'At most 120 characters'),
});

export const shopProductSchema = z
  .object({
    name: field({label: 'Product Name', kind: 'text', max: 120}),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (v) => v === '' || /^[A-Z0-9-]{3,40}$/.test(v),
        'SKU must be 3-40 letters, numbers or dashes',
      ),
    shortDesc: text('Short Description', 300),
    detailedDesc: field({label: 'Description', kind: 'text', max: 4000}),
    categoryId: z.string().min(1, 'Category is required'),
    // Optional: blank = none
    subcategoryId: z.string(),
    brandId: z.string(),
    productKind: z.enum(['FINISHED_GOOD', 'RAW_MATERIAL', 'HARDWARE', 'SERVICE']),
    businessLine: z.enum(['FURNITURE', 'ELECTRONICS', 'CROCKERY']),
    sourcing: z.enum(['TRADED', 'MANUFACTURED', 'MADE_TO_ORDER']),
    productType: text('Product Type', 60),
    roomType: z.string(),
    material: text('Material', 60),
    finish: text('Finish', 60),
    colour: text('Colour', 40),
    lengthCm: cm('Length'),
    widthCm: cm('Width'),
    heightCm: cm('Height'),
    specifications: z.array(specRow).max(30, 'At most 30 specifications'),
    assemblyRequired: z.boolean(),
    installationAvailable: z.boolean(),
    isCustomizable: z.boolean(),
    warrantyMonths: field({label: 'Warranty (months)', kind: 'quantity', required: false}).refine(
      (v) => v === undefined || v <= 240,
      'Warranty can be at most 240 months',
    ),
    warrantyTerms: text('Warranty Terms', 500),
    unit: z.string().min(1, 'Unit is required'),
    mrp: field({label: 'MRP', kind: 'price'}).refine((v) => v > 0, 'MRP must be more than 0'),
    sellingPrice: money('Selling Price'),
    wholesalePrice: money('Wholesale Price'),
    purchasePrice: money('Purchase Cost'),
    status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED']),
    // 'AUTO' = the branch GST rule, else a fixed rate such as '18'
    taxRate: z.string(),
    hsnCode: z
      .string()
      .trim()
      .min(1, 'HSN Code is required')
      .regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN Code must be 4, 6 or 8 digits'),
    careInstructions: text('Care Instructions', 300),
    tagsText: z.string().max(500).optional(),
    variants: z.array(variantRow).min(1, 'Add at least one variant').max(50, 'At most 50 variants'),
  })
  .superRefine((v, ctx) => {
    // Same rule as the server: only furniture is made in-house
    if (v.sourcing !== 'TRADED' && v.businessLine !== 'FURNITURE') {
      ctx.addIssue({code: 'custom', path: ['sourcing'], message: 'Electronics and crockery are bought and sold: choose Traded'});
    }
    if (v.sourcing !== 'TRADED' && v.productKind !== 'FINISHED_GOOD') {
      ctx.addIssue({code: 'custom', path: ['sourcing'], message: 'Raw material and hardware are bought in: choose Traded'});
    }
    if (v.sellingPrice !== undefined && v.sellingPrice > v.mrp) {
      ctx.addIssue({code: 'custom', path: ['sellingPrice'], message: 'Selling Price cannot be more than MRP'});
    }
    if (v.wholesalePrice !== undefined && v.wholesalePrice > v.mrp) {
      ctx.addIssue({code: 'custom', path: ['wholesalePrice'], message: 'Wholesale Price cannot be more than MRP'});
    }
    const seen = new Set<string>();
    v.variants.forEach((row, i) => {
      const key = `${row.variantName.trim().toLowerCase()}|${row.finish.trim().toLowerCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({code: 'custom', path: ['variants', i, 'variantName'], message: 'This variant and finish is already listed'});
      }
      seen.add(key);
    });
  });

export type ShopProductValues = z.input<typeof shopProductSchema>;
export type ShopProductOutput = z.output<typeof shopProductSchema>;

export const EMPTY_VARIANT = {
  variantName: 'Standard',
  finish: '',
  mrp: '',
  sellingPrice: '',
  wholesalePrice: '',
  openingStock: '',
};

export const EMPTY_SHOP_PRODUCT: ShopProductValues = {
  name: '',
  sku: '',
  shortDesc: '',
  detailedDesc: '',
  categoryId: '',
  subcategoryId: '',
  brandId: '',
  productKind: 'FINISHED_GOOD',
  businessLine: 'FURNITURE',
  sourcing: 'TRADED',
  productType: '',
  roomType: '',
  material: '',
  finish: '',
  colour: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  specifications: [],
  assemblyRequired: false,
  installationAvailable: false,
  isCustomizable: false,
  warrantyMonths: '',
  warrantyTerms: '',
  unit: 'PCS',
  mrp: '',
  sellingPrice: '',
  wholesalePrice: '',
  purchasePrice: '',
  status: 'DRAFT',
  taxRate: AUTO_RATE,
  hsnCode: '',
  careInstructions: '',
  tagsText: '',
  variants: [{...EMPTY_VARIANT}],
};

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export const fromShopProduct = (p: ShopProduct): ShopProductValues => ({
  name: p.name,
  sku: p.sku,
  shortDesc: p.shortDesc ?? '',
  detailedDesc: p.detailedDesc ?? '',
  categoryId: p.categoryId,
  subcategoryId: p.subcategoryId ?? '',
  brandId: p.brandId ?? '',
  productKind: p.productKind,
  businessLine: p.businessLine ?? 'FURNITURE',
  sourcing: p.sourcing ?? 'TRADED',
  productType: p.productType ?? '',
  roomType: p.roomType ?? '',
  material: p.material ?? '',
  finish: p.finish ?? '',
  colour: p.colour ?? '',
  lengthCm: str(p.lengthCm),
  widthCm: str(p.widthCm),
  heightCm: str(p.heightCm),
  specifications: p.specifications ?? [],
  assemblyRequired: p.assemblyRequired,
  installationAvailable: p.installationAvailable,
  isCustomizable: p.isCustomizable,
  warrantyMonths: str(p.warrantyMonths),
  warrantyTerms: p.warrantyTerms ?? '',
  unit: p.unit || 'PCS',
  mrp: p.mrp,
  // A selling price equal to the MRP means "no discount"
  sellingPrice: p.sellingPrice < p.mrp ? p.sellingPrice : '',
  wholesalePrice: p.wholesalePrice ? p.wholesalePrice : '',
  purchasePrice: p.purchasePrice ? p.purchasePrice : '',
  status: p.status === 'PUBLISHED' || p.status === 'UNPUBLISHED' ? p.status : 'DRAFT',
  taxRate: p.taxRate === null ? AUTO_RATE : String(p.taxRate),
  hsnCode: p.hsnCode ?? '',
  careInstructions: p.careInstructions ?? '',
  tagsText: p.tags.join(', '),
  variants: p.variants.map((v) => ({
    id: v.id,
    variantName: v.variantName,
    finish: v.finish,
    mrp: str(v.mrp),
    sellingPrice: str(v.sellingPrice),
    wholesalePrice: str(v.wholesalePrice),
    // Stock changes through purchase bills and adjustments, not this form
    openingStock: '',
  })),
});

/** Form values -> API body (tags as a list, blanks left to the backend) */
export const toShopProductBody = (
  {tagsText, sku, subcategoryId, brandId, roomType, variants, ...rest}: ShopProductOutput,
  isNew: boolean,
) => ({
  ...rest,
  taxRate: rest.taxRate === AUTO_RATE ? null : Number(rest.taxRate),
  warrantyMonths: rest.warrantyMonths ?? 0,
  sku: sku || undefined,
  subcategoryId: subcategoryId || null,
  brandId: brandId || null,
  roomType: roomType || undefined,
  tags: (tagsText ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  variants: variants.map(({openingStock, ...v}) => ({
    ...v,
    id: v.id || undefined,
    ...(isNew ? {openingStock: openingStock ?? 0} : {}),
  })),
});
