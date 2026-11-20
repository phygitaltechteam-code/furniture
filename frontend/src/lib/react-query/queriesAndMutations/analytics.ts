import {AnalyticsPanel, getAnalytics, getPlanLimits} from '@/lib/api/analytics';
import {AnalyticsDays} from '@/types/analytics';
import {keepPreviousData, useQuery} from '@tanstack/react-query';

export const useAnalytics = (panel: AnalyticsPanel, days: AnalyticsDays) =>
  useQuery({
    queryKey: ['analytics', panel, days],
    queryFn: () => getAnalytics(panel, days),
    select: (res) => res.data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

export const usePlanLimits = (enabled = true) =>
  useQuery({
    queryKey: ['plan-limits'],
    queryFn: getPlanLimits,
    select: (res) => res.data,
    staleTime: 60_000,
    enabled,
  });
