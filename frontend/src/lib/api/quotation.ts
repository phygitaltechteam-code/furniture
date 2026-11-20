import {ApiResponse} from '@/types';
import {
  Quotation,
  QuotationBillDraft,
  QuotationListItem,
  QuotationPayload,
  QuotationStatus,
  QuotationSummary,
} from '@/types/quotation';
import {api} from '@/utils/axios';

type Res<T> = Promise<ApiResponse<T>>;

// Employees reach the same API under /employee (the axios client rewrites it)
const BASE = '/shop-admin/quotations';

export type QuotationParams = {
  page: number;
  limit: number;
  search?: string;
  status?: QuotationStatus;
};

export const getQuotations = (params: QuotationParams) =>
  api.get(BASE, {
    params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
  }) as unknown as Res<{
    items: QuotationListItem[];
    pagination: {page: number; limit: number; total: number; totalPages: number};
    summary: QuotationSummary;
  }>;

export const getQuotation = (id: string) => api.get(`${BASE}/${id}`) as unknown as Res<Quotation>;

export const saveQuotation = ({id, ...body}: QuotationPayload & {id?: string}) =>
  (id ? api.patch(`${BASE}/${id}`, body) : api.post(BASE, body)) as unknown as Res<Quotation>;

export const setQuotationStatus = (id: string, status: 'SENT' | 'ACCEPTED' | 'REJECTED') =>
  api.patch(`${BASE}/${id}/status`, {status}) as unknown as Res<Quotation>;

export const deleteQuotation = (id: string) => api.delete(`${BASE}/${id}`) as unknown as Res<object>;

export const getQuotationBillDraft = (id: string) =>
  api.get(`${BASE}/${id}/bill-draft`) as unknown as Res<QuotationBillDraft>;
