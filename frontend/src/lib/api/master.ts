import {ApiResponse} from '@/types';
import {
  MasterCategory,
  MasterOption,
  MasterSubcategory,
} from '@/types/master';
import {ListParams, ListResult} from '@/types/org';
import {api} from '@/utils/axios';

type Res<T> = Promise<ApiResponse<T>>;
type Body = Record<string, unknown>;

export type MasterParams = ListParams & {
  active?: string;
  categoryId?: string;
};

const clean = (params: MasterParams) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  );

// ==========================================
// 1. CATEGORIES
// ==========================================

export const getMasterCategories = (params: MasterParams) =>
  api.get('/shop-admin/categories', {
    params: clean(params),
  }) as unknown as Res<ListResult<MasterCategory>>;

export const getMasterCategory = (id: string) =>
  api.get(`/shop-admin/categories/${id}`) as unknown as Res<MasterCategory>;

export const getMasterCategoryOptions = () =>
  api.get('/shop-admin/categories/options') as unknown as Res<MasterOption[]>;

export const saveMasterCategory = ({id, ...body}: Body & {id?: string}) =>
  (id
    ? api.patch(`/shop-admin/categories/${id}`, body)
    : api.post('/shop-admin/categories', body)) as unknown as Res<MasterCategory>;

export const deleteMasterCategory = (id: string) =>
  api.delete(`/shop-admin/categories/${id}`) as unknown as Res<object>;

// ==========================================
// 2. SUBCATEGORIES
// ==========================================

/** Shop panel by default; the company and branch panels have a read-only list */
export const getMasterSubcategories = (
  params: MasterParams,
  panel = 'shop-admin',
) =>
  api.get(`/${panel}/subcategories`, {
    params: clean(params),
  }) as unknown as Res<ListResult<MasterSubcategory>>;

export const getMasterSubcategory = (id: string) =>
  api.get(`/shop-admin/subcategories/${id}`) as unknown as Res<MasterSubcategory>;

export const saveMasterSubcategory = ({id, ...body}: Body & {id?: string}) =>
  (id
    ? api.patch(`/shop-admin/subcategories/${id}`, body)
    : api.post(
        '/shop-admin/subcategories',
        body,
      )) as unknown as Res<MasterSubcategory>;

export const deleteMasterSubcategory = (id: string) =>
  api.delete(`/shop-admin/subcategories/${id}`) as unknown as Res<object>;
