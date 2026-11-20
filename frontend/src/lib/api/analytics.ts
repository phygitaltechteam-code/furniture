import {ApiResponse} from '@/types';
import {Analytics, AnalyticsDays, PlanLimits} from '@/types/analytics';
import {api} from '@/utils/axios';

type Res<T> = Promise<ApiResponse<T>>;

/** Which API panel serves the analytics of the signed-in user */
export type AnalyticsPanel = 'super-admin' | 'company-admin' | 'branch-admin' | 'shop-admin';

export const getAnalytics = (panel: AnalyticsPanel, days: AnalyticsDays) =>
  api.get(`/${panel}/analytics`, {params: {days}}) as unknown as Res<Analytics>;

export const getPlanLimits = () => api.get('/company-admin/limits') as unknown as Res<PlanLimits>;
