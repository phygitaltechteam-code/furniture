import {ProductKind, ProductStatus, Specification} from '@/types/catalog';
import {ListParams} from '@/types/org';

export type ShopProductStatus = Extract<
  ProductStatus,
  'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED'
>;
export const SHOP_PRODUCT_STATUSES: ShopProductStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'UNPUBLISHED',
];

export type StockFilter = 'in' | 'low' | 'out';

export interface ShopProductImage {
  id: string;
  url: string;
  altText: string | null;
  order: number;
  isMain: boolean;
}

/** One sellable configuration of a product, e.g. "3 Seater" in "Walnut" */
export interface ShopVariant {
  id: string;
  variantSku: string;
  variantName: string;
  finish: string;
  barcode: string | null;
  mrp: number | null;
  sellingPrice: number | null;
  wholesalePrice: number | null;
}

export interface ShopProduct {
  id: string;
  name: string;
  sku: string;
  status: ProductStatus;
  shortDesc: string | null;
  detailedDesc: string | null;
  categoryId: string;
  subcategoryId: string | null;
  category: {id: string; name: string};
  subcategory: {id: string; name: string} | null;
  brandId: string | null;
  brand: {id: string; name: string} | null;
  variants: ShopVariant[];
  productKind: ProductKind;
  businessLine: 'FURNITURE' | 'ELECTRONICS' | 'CROCKERY';
  sourcing: 'TRADED' | 'MANUFACTURED' | 'MADE_TO_ORDER';
  mrp: number;
  sellingPrice: number;
  wholesalePrice: number;
  purchasePrice: number;
  /** Fixed GST rate; null = the branch GST rule */
  taxRate: number | null;
  hsnCode: string | null;
  /** Live stock of the active variants in the branch (what the POS and the store sell from) */
  stock: number;
  tags: string[];
  productType: string | null;
  roomType: string | null;
  material: string | null;
  finish: string | null;
  colour: string | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  specifications: Specification[];
  assemblyRequired: boolean;
  installationAvailable: boolean;
  isCustomizable: boolean;
  warrantyMonths: number;
  warrantyTerms: string | null;
  unit: string;
  careInstructions: string | null;
  images: ShopProductImage[];
  mainImage: string | null;
  createdBy?: {id: string; fullname: string} | null;
  createdAt: string;
  updatedAt: string;
}

export type ShopProductParams = ListParams & {
  subcategoryId?: string;
  productKind?: ProductKind;
  businessLine?: 'FURNITURE' | 'ELECTRONICS' | 'CROCKERY';
  sourcing?: 'TRADED' | 'MANUFACTURED' | 'MADE_TO_ORDER';
  stock?: StockFilter;
};
