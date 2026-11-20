import httpStatus from 'http-status';
import {Prisma, Role} from '@prisma/client';
import prisma from '../client';
import ApiError from '@utils/ApiError';

/*
 * Plan limits: the super admin sets, per company (admin), how many branches,
 * employees and products it may have, and whether e-commerce and
 * manufacturing are switched on. Every create path checks here first.
 */

export type LimitResource = 'branches' | 'employees' | 'products';

type Db = Prisma.TransactionClient | typeof prisma;

const LABEL: Record<LimitResource, string> = {
    branches: 'branches',
    employees: 'employees',
    products: 'products',
};

class LimitService {
    /** Current use of each limited resource */
    public async usage(companyId: string, db: Db = prisma) {
        const [branches, employees, products] = await Promise.all([
            db.branch.count({where: {companyId, deletedAt: null}}),
            db.user.count({
                where: {
                    companyId,
                    deletedAt: null,
                    role: {in: [Role.BRANCH_MANAGER, Role.EMPLOYEE]},
                },
            }),
            db.product.count({where: {companyId, deletedAt: null}}),
        ]);
        return {branches, employees, products};
    }

    /** Limits, use and what is left, for the admin's dashboard and the super admin */
    public async summary(companyId: string, db: Db = prisma) {
        const company = await db.company.findUniqueOrThrow({
            where: {id: companyId},
            select: {
                maxBranches: true,
                maxEmployees: true,
                maxProducts: true,
                ecommerceEnabled: true,
                manufacturingEnabled: true,
            },
        });
        const used = await this.usage(companyId, db);
        const row = (limit: number, n: number) => ({limit, used: n, left: Math.max(limit - n, 0)});
        return {
            branches: row(company.maxBranches, used.branches),
            employees: row(company.maxEmployees, used.employees),
            products: row(company.maxProducts, used.products),
            ecommerceEnabled: company.ecommerceEnabled,
            manufacturingEnabled: company.manufacturingEnabled,
        };
    }

    /** 403 with a clear message when adding `count` more would pass the plan limit */
    public async assertCanAdd(companyId: string, what: LimitResource, count = 1, db: Db = prisma) {
        const s = await this.summary(companyId, db);
        const {limit, used} = s[what];
        if (used + count > limit) {
            throw new ApiError(
                httpStatus.FORBIDDEN,
                `Your plan allows ${limit} ${LABEL[what]} and ${used} are in use. Ask the super admin to raise the limit.`,
            );
        }
    }

    /** 403 when a module is switched off for the company */
    public async assertModule(companyId: string, module: 'ecommerce' | 'manufacturing', db: Db = prisma) {
        const c = await db.company.findUnique({
            where: {id: companyId},
            select: {ecommerceEnabled: true, manufacturingEnabled: true},
        });
        const on = module === 'ecommerce' ? c?.ecommerceEnabled : c?.manufacturingEnabled;
        if (!on) {
            throw new ApiError(
                httpStatus.FORBIDDEN,
                `The ${module === 'ecommerce' ? 'online store' : 'manufacturing'} module is not enabled for your plan`,
            );
        }
    }
}

export default new LimitService();
