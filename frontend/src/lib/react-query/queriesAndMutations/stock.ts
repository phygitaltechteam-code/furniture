import type {StockKind, StockLine} from '@/types/stock';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  getStockSummary,
  adjustStock,
  recordPhysicalStockCount,
} from '@/lib/api/stock';
import {
  StockPeriod,
  StockTab,
  AdjustStockPayload,
  PhysicalStockCountPayload,
} from '@/types/stock';

export const STOCK_KEYS = {
  all: ['stock'] as const,
  summary: (panel: string, period?: StockPeriod, tab?: StockTab, search?: string, kind?: string, line?: string) =>
    [...STOCK_KEYS.all, 'summary', panel, period, tab, search, kind, line] as const,
};

export const useStockSummary = (
  panel: string = 'shop-admin',
  params?: {
    period?: StockPeriod;
    tab?: StockTab;
    search?: string;
    kind?: StockKind;
    line?: StockLine;
  }
) =>
  useQuery({
    queryKey: STOCK_KEYS.summary(panel, params?.period, params?.tab, params?.search, params?.kind, params?.line),
    queryFn: () => getStockSummary(panel, params),
    staleTime: 30_000,
  });

export const useAdjustStock = (panel: string = 'shop-admin') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdjustStockPayload) => adjustStock(panel, payload),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: STOCK_KEYS.all});
    },
  });
};

export const usePhysicalStockCount = (panel: string = 'shop-admin') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PhysicalStockCountPayload) =>
      recordPhysicalStockCount(panel, payload),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: STOCK_KEYS.all});
    },
  });
};

