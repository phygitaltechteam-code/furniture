import httpStatus from 'http-status';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import prisma from '../client';
import {ApiError} from '@utils/index';
import {listArgs, searchWhere, toListResult} from '../utils/list';
import masterValidation from '../validations/master.validation';
import accountService from './account.service';

type CategoryInput = z.infer<typeof masterValidation.createCategorySchema>;
type CategoryUpdate = z.infer<typeof masterValidation.updateCategorySchema>;
type SubcategoryInput = z.infer<typeof masterValidation.createSubcategorySchema>;
type SubcategoryUpdate = z.infer<typeof masterValidation.updateSubcategorySchema>;
type MasterList = z.infer<typeof masterValidation.masterListSchema>;

/*
 * Catalog masters: categories and subcategories.
 *
 * Categories and subcategories: one list per company, shared by its shops.
 * Rows with companyId = null are platform-wide (made by the super admin): every
 * company can pick them, but only the super admin can change them. A company
 * can never see or change another company's masters.
 *
 */

const codeFrom = (name: string) =>
    name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'ITEM';

const uniqueCode = async (base: string, taken: (prefix: string) => Promise<string[]>) => {
    const used = new Set(await taken(base));
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
};

/** What a company can see: its own rows and the platform-wide ones */
const visible = (companyId: string) => ({OR: [{companyId}, {companyId: null}]});

const conflict = (message: string, field = 'name') =>
    new ApiError(httpStatus.CONFLICT, message, [{field, message}]);

const notFound = (what: string) => new ApiError(httpStatus.NOT_FOUND, `${what} not found`);

const readOnly = (what: string) =>
    new ApiError(
        httpStatus.FORBIDDEN,
        `This ${what} is shared across the platform and can only be changed by the super admin`,
    );

const withFlag = <T extends {companyId: string | null}>(row: T) => ({
    ...row,
    isGlobal: !row.companyId,
});

class MasterService {
    /** A row the company may change: its own, never a platform-wide one */
    private async owned<T extends {companyId: string | null} | null>(
        row: T,
        companyId: string,
        what: string,
    ): Promise<NonNullable<T>> {
        if (!row || (row.companyId && row.companyId !== companyId)) throw notFound(what);
        if (!row.companyId) throw readOnly(what.toLowerCase());
        return row as NonNullable<T>;
    }

    // ==========================================
    // 1. CATEGORIES
    // ==========================================

    public async listCategories(companyId: string, query: MasterList) {
        const where: Prisma.CategoryWhereInput = {
            AND: [visible(companyId), {OR: searchWhere(query.search, ['name', 'code'] as const)}],
            ...(query.active ? {isActive: query.active === 'true'} : {}),
        };
        const [items, total] = await prisma.$transaction([
            prisma.category.findMany({
                where,
                include: {
                    _count: {
                        select: {
                            products: {where: {deletedAt: null, companyId}},
                            subcategories: {where: visible(companyId)},
                        },
                    },
                },
                ...listArgs(query),
            }),
            prisma.category.count({where}),
        ]);
        return toListResult(
            items.map(({_count, ...c}) => ({
                ...withFlag(c),
                productCount: _count.products,
                subcategoryCount: _count.subcategories,
            })),
            total,
            query,
        );
    }

    public async getCategory(companyId: string, id: string) {
        const category = await prisma.category.findFirst({
            where: {id, ...visible(companyId)},
            include: {
                subcategories: {
                    where: visible(companyId),
                    select: {id: true, name: true, code: true, isActive: true},
                    orderBy: {name: 'asc'},
                },
                _count: {
                    select: {
                        products: {where: {deletedAt: null, companyId}},
                        subcategories: {where: visible(companyId)},
                    },
                },
            },
        });
        if (!category) throw notFound('Category');
        const {_count, ...rest} = category;
        return {
            ...withFlag(rest),
            productCount: _count.products,
            subcategoryCount: _count.subcategories,
        };
    }

    public async categoryOptions(companyId: string) {
        return prisma.category.findMany({
            where: {isActive: true, ...visible(companyId)},
            select: {id: true, name: true, code: true},
            orderBy: [{displayOrder: 'asc'}, {name: 'asc'}],
        });
    }

    private async assertCategoryNameFree(companyId: string, name: string, exceptId?: string) {
        const clash = await prisma.category.findFirst({
            where: {
                name: {equals: name, mode: 'insensitive'},
                ...visible(companyId),
                ...(exceptId ? {NOT: {id: exceptId}} : {}),
            },
            select: {id: true},
        });
        if (clash) throw conflict('A category with this name already exists');
    }

    public async createCategory(companyId: string, data: CategoryInput) {
        await this.assertCategoryNameFree(companyId, data.name);
        return accountService.withRetry(async () => {
            const code = await uniqueCode(codeFrom(data.name), async (prefix) =>
                (
                    await prisma.category.findMany({
                        where: {code: {startsWith: prefix}},
                        select: {code: true},
                    })
                ).map((c) => c.code),
            );
            return prisma.category.create({
                data: {
                    companyId,
                    name: data.name,
                    code,
                    description: data.description,
                    displayOrder: data.displayOrder ?? 0,
                    isActive: data.isActive ?? true,
                },
            });
        }, 'code');
    }

    public async updateCategory(companyId: string, id: string, data: CategoryUpdate) {
        const before = await this.owned(
            await prisma.category.findUnique({where: {id}}),
            companyId,
            'Category',
        );
        if (data.name && data.name.toLowerCase() !== before.name.toLowerCase()) {
            await this.assertCategoryNameFree(companyId, data.name, id);
        }
        const after = await prisma.category.update({where: {id}, data});
        return {before, after};
    }

    public async deleteCategory(companyId: string, id: string) {
        const category = await this.owned(
            await prisma.category.findUnique({
                where: {id},
                include: {_count: {select: {products: true, subcategories: true}}},
            }),
            companyId,
            'Category',
        );
        if (category._count.products > 0 || category._count.subcategories > 0) {
            throw new ApiError(
                httpStatus.CONFLICT,
                `Cannot delete: this category has ${category._count.subcategories} subcategories and ${category._count.products} products. Move them first, or deactivate the category.`,
            );
        }
        await prisma.category.delete({where: {id}});
        return {before: category};
    }

    // ==========================================
    // 2. SUBCATEGORIES
    // ==========================================

    public async listSubcategories(companyId: string, query: MasterList) {
        const where: Prisma.SubcategoryWhereInput = {
            AND: [visible(companyId), {OR: searchWhere(query.search, ['name', 'code'] as const)}],
            ...(query.active ? {isActive: query.active === 'true'} : {}),
            ...(query.categoryId ? {categoryId: query.categoryId} : {}),
        };
        const [items, total] = await prisma.$transaction([
            prisma.subcategory.findMany({
                where,
                include: {category: {select: {id: true, name: true, code: true}}},
                ...listArgs(query),
            }),
            prisma.subcategory.count({where}),
        ]);
        return toListResult(items.map(withFlag), total, query);
    }

    public async getSubcategory(companyId: string, id: string) {
        const sub = await prisma.subcategory.findFirst({
            where: {id, ...visible(companyId)},
            include: {category: {select: {id: true, name: true, code: true}}},
        });
        if (!sub) throw notFound('Subcategory');
        return withFlag(sub);
    }

    /** The parent must be one of the company's categories or a platform-wide one */
    private async assertParent(companyId: string, categoryId: string) {
        const parent = await prisma.category.findFirst({
            where: {id: categoryId, ...visible(companyId)},
            select: {id: true},
        });
        if (!parent) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Selected parent category does not exist', [
                {field: 'categoryId', message: 'Selected parent category does not exist'},
            ]);
        }
    }

    private async assertSubcategoryNameFree(
        companyId: string,
        categoryId: string,
        name: string,
        exceptId?: string,
    ) {
        const clash = await prisma.subcategory.findFirst({
            where: {
                categoryId,
                name: {equals: name, mode: 'insensitive'},
                ...visible(companyId),
                ...(exceptId ? {NOT: {id: exceptId}} : {}),
            },
            select: {id: true},
        });
        if (clash) throw conflict('A subcategory with this name already exists in this category');
    }

    public async createSubcategory(companyId: string, data: SubcategoryInput) {
        await this.assertParent(companyId, data.categoryId);
        await this.assertSubcategoryNameFree(companyId, data.categoryId, data.name);
        return accountService.withRetry(async () => {
            const code = await uniqueCode(codeFrom(data.name), async (prefix) =>
                (
                    await prisma.subcategory.findMany({
                        where: {code: {startsWith: prefix}},
                        select: {code: true},
                    })
                ).map((s) => s.code),
            );
            return prisma.subcategory.create({
                data: {
                    companyId,
                    categoryId: data.categoryId,
                    name: data.name,
                    code,
                    description: data.description,
                    displayOrder: data.displayOrder ?? 0,
                    isActive: data.isActive ?? true,
                },
                include: {category: {select: {id: true, name: true, code: true}}},
            });
        }, 'code');
    }

    public async updateSubcategory(companyId: string, id: string, data: SubcategoryUpdate) {
        const before = await this.owned(
            await prisma.subcategory.findUnique({where: {id}}),
            companyId,
            'Subcategory',
        );
        const categoryId = data.categoryId ?? before.categoryId;
        if (data.categoryId && data.categoryId !== before.categoryId) {
            await this.assertParent(companyId, data.categoryId);
        }
        if (data.name || data.categoryId) {
            await this.assertSubcategoryNameFree(
                companyId,
                categoryId,
                data.name ?? before.name,
                id,
            );
        }
        const after = await prisma.subcategory.update({
            where: {id},
            data,
            include: {category: {select: {id: true, name: true, code: true}}},
        });
        return {before, after};
    }

    public async deleteSubcategory(companyId: string, id: string) {
        const sub = await this.owned(
            await prisma.subcategory.findUnique({where: {id}}),
            companyId,
            'Subcategory',
        );
        const used = await prisma.product.count({where: {subcategoryId: id, deletedAt: null}});
        if (used) {
            throw new ApiError(
                httpStatus.CONFLICT,
                `This subcategory is used by ${used} product(s); deactivate it instead`,
            );
        }
        await prisma.subcategory.delete({where: {id}});
        return {before: sub};
    }
}

export default new MasterService();
