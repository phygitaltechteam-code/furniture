import {Request} from 'express';
import httpStatus from 'http-status';
import {Role} from '@prisma/client';
import analyticsService, {AnalyticsScope, analyticsQuerySchema} from '../services/analytics.service';
import {ApiError, catchAsync} from '@utils/index';
import {ok} from './scope';

/** Platform, one company (admin) or one branch (manager, employees, admin in branch mode) */
const scopeOf = (req: Request): AnalyticsScope => {
    const {role, companyId, branchId} = req.user;
    if (role === Role.SUPER_ADMIN) return {};
    if (!companyId) throw new ApiError(httpStatus.FORBIDDEN, 'No company is linked to this account');
    if (role === Role.ADMIN) return {companyId};
    if (!branchId) throw new ApiError(httpStatus.FORBIDDEN, 'No branch is linked to this account');
    return {companyId, branchId};
};

const summary = catchAsync(async (req, res) => {
    const {days} = analyticsQuerySchema.parse(req.query);
    return ok(res, await analyticsService.summary(scopeOf(req), days), 'Analytics fetched successfully');
});

export default {summary};
