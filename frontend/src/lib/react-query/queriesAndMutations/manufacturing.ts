import * as mf from '@/lib/api/manufacturing';
import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const MFG_KEYS = {WOS: 'work-orders', WO: 'work-order', OPTIONS: 'work-order-options', BOM: 'bom', DELIVERIES: 'deliveries', TEAM: 'delivery-team'};

export const useWorkOrders = (p: mf.WorkOrderParams) =>
  useQuery({queryKey: [MFG_KEYS.WOS, p], queryFn: () => mf.getWorkOrders(p).then((r) => r.data), placeholderData: keepPreviousData});

export const useWorkOrder = (id?: string) =>
  useQuery({queryKey: [MFG_KEYS.WO, id], queryFn: () => mf.getWorkOrder(id!).then((r) => r.data), enabled: !!id});

export const useWorkOrderOptions = () =>
  useQuery({queryKey: [MFG_KEYS.OPTIONS], queryFn: () => mf.getWorkOrderOptions().then((r) => r.data), staleTime: 60_000});

export const useBom = (productId?: string, enabled = true) =>
  useQuery({queryKey: [MFG_KEYS.BOM, productId], queryFn: () => mf.getBom(productId!).then((r) => r.data), enabled: !!productId && enabled});

export const useDeliveries = (p: mf.DeliveryParams) =>
  useQuery({queryKey: [MFG_KEYS.DELIVERIES, p], queryFn: () => mf.getDeliveries(p).then((r) => r.data), placeholderData: keepPreviousData});

export const useDeliveryTeam = () =>
  useQuery({queryKey: [MFG_KEYS.TEAM], queryFn: () => mf.getDeliveryTeam().then((r) => r.data), staleTime: 5 * 60_000});

/** Every manufacturing change refreshes work orders, stock and deliveries */
const useMfgMutation = <V, R extends {message?: string}>(fn: (v: V) => Promise<R>, okText?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      toast.success(okText ?? res.message ?? 'Saved');
      for (const k of [MFG_KEYS.WOS, MFG_KEYS.WO, MFG_KEYS.OPTIONS, MFG_KEYS.DELIVERIES, MFG_KEYS.BOM, 'stock']) {
        qc.invalidateQueries({queryKey: [k]});
      }
    },
  });
};

export const useSaveWorkOrder = () => useMfgMutation(mf.saveWorkOrder);
export const useIssueMaterial = () => useMfgMutation((v: {id: string; lines?: {variantId: string; quantity: number}[]}) => mf.issueMaterial(v.id, v.lines));
export const useReturnMaterial = () => useMfgMutation((v: {id: string; lines: {variantId: string; quantity: number}[]}) => mf.returnMaterial(v.id, v.lines));
export const useSetStage = () => useMfgMutation((v: {id: string; key: string; done: boolean}) => mf.setStage(v.id, v.key, v.done));
export const useRecordQc = () => useMfgMutation((v: {id: string; passed: boolean; notes?: string}) => mf.recordQc(v.id, v.passed, v.notes));
export const useCompleteWorkOrder = () => useMfgMutation((v: {id: string; rackNo?: string}) => mf.completeWorkOrder(v.id, v.rackNo));
export const useCancelWorkOrder = () => useMfgMutation((v: {id: string; reason: string}) => mf.cancelWorkOrder(v.id, v.reason));
export const useSaveBom = () => useMfgMutation((v: {productId: string; lines: Parameters<typeof mf.saveBom>[1]}) => mf.saveBom(v.productId, v.lines));
export const useSetRack = () => useMfgMutation((v: {variantId: string; rackNo: string}) => mf.setRack(v.variantId, v.rackNo), 'Rack saved');
export const useCreateDelivery = () => useMfgMutation(mf.createDelivery);
export const useAssignDelivery = () => useMfgMutation((v: {id: string} & Parameters<typeof mf.assignDelivery>[1]) => mf.assignDelivery(v.id, v));
export const useDeliveryStatus = () =>
  useMfgMutation((v: {id: string; status: Parameters<typeof mf.setDeliveryStatus>[1]; outcomeNote?: string}) => mf.setDeliveryStatus(v.id, v.status, v.outcomeNote));
