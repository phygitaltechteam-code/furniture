import {
  deleteQuotation,
  getQuotation,
  getQuotationBillDraft,
  getQuotations,
  QuotationParams,
  saveQuotation,
  setQuotationStatus,
} from '@/lib/api/quotation';
import {getErrorMessage} from '@/utils/axios';
import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const QUOTATION_KEYS = {LIST: 'quotations', ONE: 'quotation', DRAFT: 'quotation-bill-draft'};

export const useQuotations = (params: QuotationParams) =>
  useQuery({
    queryKey: [QUOTATION_KEYS.LIST, params],
    queryFn: () => getQuotations(params).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

export const useQuotation = (id?: string) =>
  useQuery({
    queryKey: [QUOTATION_KEYS.ONE, id],
    queryFn: () => getQuotation(id as string).then((r) => r.data),
    enabled: !!id,
  });

/** What the POS needs to bill a quotation (?quotation=<id>) */
export const useQuotationBillDraft = (id?: string) =>
  useQuery({
    queryKey: [QUOTATION_KEYS.DRAFT, id],
    queryFn: () => getQuotationBillDraft(id as string).then((r) => r.data),
    enabled: !!id,
    retry: false,
  });

const useRefresh = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({queryKey: [QUOTATION_KEYS.LIST]});
    qc.invalidateQueries({queryKey: [QUOTATION_KEYS.ONE]});
  };
};

export const useSaveQuotation = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: saveQuotation,
    onSuccess: (res) => {
      toast.success(res.message);
      refresh();
    },
  });
};

export const useQuotationStatus = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({id, status}: {id: string; status: 'SENT' | 'ACCEPTED' | 'REJECTED'}) =>
      setQuotationStatus(id, status),
    onSuccess: (res) => {
      toast.success(res.message);
      refresh();
    },
    onError: (e) => toast.error(getErrorMessage(e, 'Could not change the status')),
  });
};

export const useDeleteQuotation = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: deleteQuotation,
    onSuccess: () => {
      toast.success('Quotation deleted');
      refresh();
    },
    onError: (e) => toast.error(getErrorMessage(e, 'Could not delete the quotation')),
  });
};
