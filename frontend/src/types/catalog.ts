/** Admin panels that work with the catalog (API prefix) */
export type CatalogPanel =
  | 'super-admin'
  | 'company-admin'
  | 'branch-admin'
  | 'shop-admin'
  | 'employee';

export type ProductStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'UNPUBLISHED'
  | 'ARCHIVED';

/** FINISHED_GOOD is sold; raw materials and hardware are used in manufacturing */
export type ProductKind = 'FINISHED_GOOD' | 'RAW_MATERIAL' | 'HARDWARE' | 'SERVICE';

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  FINISHED_GOOD: 'Finished product',
  RAW_MATERIAL: 'Raw material',
  HARDWARE: 'Hardware',
  SERVICE: 'Service',
};

export type Specification = {key: string; value: string};

export interface Category {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  parent: {id: string; name: string} | null;
  description: string | null;
  displayOrder: number;
  seoTitle: string | null;
  seoDesc: string | null;
  isActive: boolean;
  productCount: number;
  childCount: number;
}

export interface Brand {
  id: string;
  name: string;
  code: string;
  description: string | null;
  website: string | null;
  isActive: boolean;
  isGlobal: boolean;
  productCount: number;
}

export interface Variant {
  id: string;
  variantSku: string;
  variantName: string;
  finish: string;
  barcode?: string | null;
  mrp: number | null;
  sellingPrice: number | null;
  wholesalePrice?: number | null;
  isActive: boolean;
  available: number;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  order: number;
  isMain: boolean;
}

export interface Product {
  id: string;
  companyId: string;
  company: {id: string; name: string; code: string};
  name: string;
  sku: string;
  categoryId: string;
  category: {id: string; name: string};
  /** The branch outlet that sells it; null = not in any branch (can't be sold) */
  shopId: string | null;
  shop: {id: string; name: string; branchId: string} | null;
  brandId: string | null;
  brand: {id: string; name: string} | null;
  shortDesc: string | null;
  detailedDesc: string | null;
  tags: string[];
  productKind: ProductKind;
  productType: string | null;
  roomType: string | null;
  material: string | null;
  finish: string | null;
  colour: string | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  specifications: Specification[] | null;
  assemblyRequired: boolean;
  installationAvailable: boolean;
  warrantyMonths: number;
  warrantyTerms: string | null;
  isCustomizable: boolean;
  unit: string;
  wholesalePrice: number;
  purchasePrice: number;
  careInstructions: string | null;
  countryOfOrigin: string | null;
  mrp: number;
  sellingPrice: number;
  /** Fixed GST rate; null = the branch GST rule */
  taxRate: number | null;
  hsnCode: string | null;
  weightKg: number | null;
  dimensions: string | null;
  returnEligible: boolean;
  returnPeriodDays: number;
  seoTitle: string | null;
  seoDesc: string | null;
  status: ProductStatus;
  createdBy: {id: string; fullname: string} | null;
  images: ProductImage[];
  variants: Variant[];
  mainImage: string | null;
  activeVariantCount: number;
  stock: number;
  canEdit: boolean;
  canPublish: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Option = {id: string; name: string};
