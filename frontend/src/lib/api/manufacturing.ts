import {ApiResponse} from '@/types';
import {
  Bom,
  Delivery,
  DeliveryPayload,
  DeliveryStatus,
  DeliverySummary,
  Paged,
  Slot,
  WorkOrder,
  WorkOrderListItem,
  WorkOrderOptions,
  WorkOrderPayload,
  WorkOrderStatus,
  WorkOrderSummary,
  WorkOrderType,
} from '@/types/manufacturing';
import {api} from '@/utils/axios';

type Res<T> = Promise<ApiResponse<T>>;

// Employees reach the same API under /employee (the axios client rewrites it)
const WO = '/shop-admin/work-orders';
const DL = '/shop-admin/deliveries';
const clean = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ''));

export type WorkOrderParams = {page: number; limit: number; search?: string; status?: WorkOrderStatus; type?: WorkOrderType};
export type DeliveryParams = {page: number; limit: number; search?: string; status?: DeliveryStatus; day?: 'today' | 'upcoming' | 'overdue'};

export const getWorkOrders = (p: WorkOrderParams) => api.get(WO, {params: clean(p)}) as unknown as Res<Paged<WorkOrderListItem, WorkOrderSummary>>;
export const getWorkOrder = (id: string) => api.get(`${WO}/${id}`) as unknown as Res<WorkOrder>;
export const getWorkOrderOptions = () => api.get(`${WO}/options`) as unknown as Res<WorkOrderOptions>;
export const saveWorkOrder = ({id, ...body}: Partial<WorkOrderPayload> & {id?: string}) =>
  (id ? api.patch(`${WO}/${id}`, body) : api.post(WO, body)) as unknown as Res<WorkOrder>;

type Line = {variantId: string; quantity: number};
export const issueMaterial = (id: string, lines?: Line[]) => api.post(`${WO}/${id}/issue`, {lines}) as unknown as Res<WorkOrder>;
export const returnMaterial = (id: string, lines: Line[]) => api.post(`${WO}/${id}/return`, {lines}) as unknown as Res<WorkOrder>;
export const setStage = (id: string, key: string, done: boolean) => api.post(`${WO}/${id}/stage`, {key, done}) as unknown as Res<WorkOrder>;
export const recordQc = (id: string, passed: boolean, notes?: string) => api.post(`${WO}/${id}/qc`, {passed, notes}) as unknown as Res<WorkOrder>;
export const completeWorkOrder = (id: string, rackNo?: string) => api.post(`${WO}/${id}/complete`, {rackNo}) as unknown as Res<WorkOrder>;
export const cancelWorkOrder = (id: string, reason: string) => api.post(`${WO}/${id}/cancel`, {reason}) as unknown as Res<WorkOrder>;

export const getBom = (productId: string) => api.get(`/shop-admin/bom/${productId}`) as unknown as Res<Bom>;
export const saveBom = (productId: string, lines: {materialVariantId: string; quantity: number; wastagePct: number; notes?: string}[]) =>
  api.put(`/shop-admin/bom/${productId}`, {lines}) as unknown as Res<Bom>;
export const setRack = (variantId: string, rackNo: string) => api.patch(`/shop-admin/racks/${variantId}`, {rackNo}) as unknown as Res<{variantId: string; rackNo: string | null}>;

export const getDeliveries = (p: DeliveryParams) => api.get(DL, {params: clean(p)}) as unknown as Res<Paged<Delivery, DeliverySummary>>;
export const getDeliveryTeam = () => api.get(`${DL}/team`) as unknown as Res<{id: string; fullname: string; phoneNumber: string; department: string | null}[]>;
export const createDelivery = (body: DeliveryPayload) => api.post(DL, body) as unknown as Res<Delivery>;
export const assignDelivery = (id: string, body: {assignedToId?: string; scheduledDate?: string; slot?: Slot}) =>
  api.patch(`${DL}/${id}/assign`, body) as unknown as Res<Delivery>;
export const setDeliveryStatus = (id: string, status: Exclude<DeliveryStatus, 'SCHEDULED'>, outcomeNote?: string) =>
  api.patch(`${DL}/${id}/status`, {status, outcomeNote}) as unknown as Res<Delivery>;
