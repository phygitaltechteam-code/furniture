import httpStatus from 'http-status';
import {BillStatus, OrderStatus, Prisma, ProductKind, ProductStatus} from '@prisma/client';
import {z} from 'zod';
import prisma from '../../client';
import ApiError from '@utils/ApiError';
import {rateFor} from '../../utils/gst';
import shopGstService from '../shopGst.service';
import storeSettingsService, {StoreRules} from '../storeSettings.service';
import {logger} from '@config/index';

/** Most products the in-memory catalog loads at once */
const CATALOG_CAP = 2000;

/*
 * Customer storefront catalog (public, no sign-in).
 *
 * Only PUBLISHED finished goods of an ACTIVE branch and company are shown
 * (LISTED); raw materials and hardware are never sold online. Stock is the
 * branch inventory (physical - reserved) of each variant. The catalog is
 * small enough to filter, facet and sort in memory after one query, which
 * keeps the facet counts exact.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;

export const SORTS = ['popular', 'new', 'price_asc', 'price_desc', 'discount', 'rating'] as const;

const csv = z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
        (Array.isArray(v) ? v : (v ?? '').split(','))
            .map((s) => s.trim())
            .filter(Boolean),
    );

export const productQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    category: csv,
    subcategory: csv,
    brand: csv,
    room: csv,
    material: csv,
    finish: csv,
    priceMin: z.coerce.number().min(0).optional(),
    priceMax: z.coerce.number().min(0).optional(),
    minDiscount: z.coerce.number().min(0).max(90).optional(),
    inStock: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    newOnly: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    customizable: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    sort: z.enum(SORTS).default('popular'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(60).default(20),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

/** What the store lists; also the only products a customer can bag, wishlist or order */
export const LISTED: Prisma.ProductWhereInput = {
    status: ProductStatus.PUBLISHED,
    productKind: ProductKind.FINISHED_GOOD,
    deletedAt: null,
    shop: {status: 'ACTIVE', deletedAt: null, branch: {status: 'ACTIVE', deletedAt: null}},
    company: {status: 'ACTIVE', deletedAt: null, ecommerceEnabled: true},
};

const CARD_SELECT = {
    id: true,
    slug: true,
    name: true,
    shortDesc: true,
    mrp: true,
    sellingPrice: true,
    roomType: true,
    material: true,
    isCustomizable: true,
    warrantyMonths: true,
    tags: true,
    createdAt: true,
    companyId: true,
    brand: {select: {name: true}},
    category: {select: {name: true}},
    subcategory: {select: {name: true}},
    shop: {select: {id: true, name: true, branchId: true, branch: {select: {name: true, city: true}}}},
    images: {orderBy: [{isMain: 'desc' as const}, {order: 'asc' as const}], take: 2, select: {url: true}},
    variants: {
        where: {isActive: true},
        select: {
            id: true,
            variantName: true,
            finish: true,
            image: true,
            mrp: true,
            sellingPrice: true,
            inventories: {select: {branchId: true, physicalQty: true, reservedQty: true}},
        },
    },
} satisfies Prisma.ProductSelect;

type Row = Prisma.ProductGetPayload<{select: typeof CARD_SELECT}>;

export const stockOf = (
    v: {inventories: {branchId: string; physicalQty: number; reservedQty: number}[]},
    branchId: string,
) => {
    const inv = v.inventories.find((i) => i.branchId === branchId);
    return inv ? Math.max(0, inv.physicalQty - inv.reservedQty) : 0;
};

class CatalogService {
    /** Ratings and units sold per product, for cards and sorting */
    private async stats(productIds: string[]) {
        if (!productIds.length) return {rating: new Map(), sold: new Map()};
        const [ratings, ordered, billed] = await Promise.all([
            prisma.productReview.groupBy({
                by: ['productId'],
                where: {productId: {in: productIds}},
                _avg: {rating: true},
                _count: true,
            }),
            prisma.orderItem.groupBy({
                by: ['productId'],
                where: {productId: {in: productIds}, order: {status: {not: OrderStatus.CANCELLED}}},
                _sum: {quantity: true},
            }),
            prisma.salesBillItem.groupBy({
                by: ['productId'],
                where: {productId: {in: productIds}, bill: {status: BillStatus.CONFIRMED, deletedAt: null}},
                _sum: {quantity: true},
            }),
        ]);
        const rating = new Map<string, {avg: number; count: number}>(
            ratings.map((r) => [r.productId, {avg: round2(r._avg.rating ?? 0), count: r._count}]),
        );
        const sold = new Map<string, number>();
        for (const r of [...ordered, ...billed]) {
            sold.set(r.productId, (sold.get(r.productId) ?? 0) + (r._sum.quantity ?? 0));
        }
        return {rating, sold};
    }

    /** Card shape used everywhere on the store */
    private toCard(
        p: Row,
        stats: {rating: Map<string, {avg: number; count: number}>; sold: Map<string, number>},
        bestsellerIds: Set<string>,
        settings: StoreRules,
    ) {
        const branchId = p.shop!.branchId;
        const stock = p.variants.reduce((t, v) => t + stockOf(v, branchId), 0);
        const prices = p.variants.map((v) => v.sellingPrice ?? p.sellingPrice ?? p.mrp);
        const price = prices.length ? Math.min(...prices) : p.sellingPrice || p.mrp;
        const mrp = p.mrp;
        const discountPct = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
        const isNew = Date.now() - p.createdAt.getTime() < settings.newProductDays * DAY;
        const badge =
            stock === 0
                ? p.isCustomizable
                    ? 'MADE_TO_ORDER'
                    : 'OUT_OF_STOCK'
                : bestsellerIds.has(p.id)
                  ? 'BESTSELLER'
                  : stock <= settings.limitedBadgeAt
                    ? 'LIMITED'
                    : isNew
                      ? 'NEW'
                      : null;
        return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            brand: p.brand?.name ?? null,
            category: p.category?.name ?? null,
            subcategory: p.subcategory?.name ?? null,
            room: p.roomType,
            material: p.material,
            image: p.images[0]?.url ?? p.variants.find((v) => v.image)?.image ?? null,
            hoverImage: p.images[1]?.url ?? null,
            finishes: [...new Set(p.variants.map((v) => v.finish))],
            variantNames: [...new Set(p.variants.map((v) => v.variantName))],
            price,
            mrp,
            discountPct,
            rating: stats.rating.get(p.id) ?? {avg: 0, count: 0},
            sold: stats.sold.get(p.id) ?? 0,
            inStock: stock > 0,
            stock,
            badge,
            isCustomizable: p.isCustomizable,
            warrantyMonths: p.warrantyMonths,
            createdAt: p.createdAt,
            shop: {name: p.shop!.branch.name, city: p.shop!.branch.city},
        };
    }

    private async cards(where: Prisma.ProductWhereInput) {
        // Facets are counted in memory over every listed product; past the cap it is
        // logged loudly, move the filtering into the database before the catalog grows that big
        const rows = await prisma.product.findMany({
            where: {...LISTED, ...where},
            select: CARD_SELECT,
            take: CATALOG_CAP + 1,
        });
        if (rows.length > CATALOG_CAP) {
            logger.warn(`Store catalog has more than ${CATALOG_CAP} listed products; only the first ${CATALOG_CAP} are shown`);
            rows.length = CATALOG_CAP;
        }
        const stats = await this.stats(rows.map((r) => r.id));
        // Bestsellers: the top tenth by units sold (at least 1 sold)
        const ranked = [...stats.sold.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        const best = new Set(ranked.slice(0, Math.max(1, Math.ceil(rows.length / 10))).map(([id]) => id));
        const settings = await storeSettingsService.get();
        const cards = rows.map((r) => this.toCard(r, stats, best, settings));
        // Several branches can stock the same product (each keeps its own copy for
        // its own stock). Online it is one product: show the copy with the most
        // stock, so the order goes to the branch that can ship it.
        const byKey = new Map<string, (typeof cards)[number]>();
        for (const c of cards) {
            const key = `${c.brand}|${c.name}`.toLowerCase();
            const kept = byKey.get(key);
            if (!kept || Number(c.inStock) - Number(kept.inStock) > 0 || (c.inStock === kept.inStock && c.stock > kept.stock)) {
                byKey.set(key, c);
            }
        }
        return [...byKey.values()];
    }

    public async listProducts(query: ProductQuery) {
        const lc = (a: string[]) => a.map((s) => s.toLowerCase());
        const [cats, subs, brands, rooms, materials, finishes] = [
            lc(query.category),
            lc(query.subcategory),
            lc(query.brand),
            lc(query.room),
            lc(query.material),
            lc(query.finish),
        ];
        // Words of the search; plurals match too ("sofas" -> "sofa", "chairs" -> "chair")
        const words = (query.q ?? '')
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((w) => w.length > 1)
            .slice(0, 6)
            .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

        const {newProductDays} = await storeSettingsService.get();
        const base = (
            await this.cards({
                // Every word must match somewhere: "teak bed" finds "Royal Teak King Bed"
                ...(words.length
                    ? {
                          AND: words.map((w) => ({
                              OR: [
                                  {name: {contains: w, mode: 'insensitive' as const}},
                                  {tags: {has: w}},
                                  {productType: {contains: w, mode: 'insensitive' as const}},
                                  {material: {contains: w, mode: 'insensitive' as const}},
                                  {roomType: {contains: w, mode: 'insensitive' as const}},
                                  {category: {name: {contains: w, mode: 'insensitive' as const}}},
                                  {subcategory: {name: {contains: w, mode: 'insensitive' as const}}},
                                  {brand: {name: {contains: w, mode: 'insensitive' as const}}},
                                  {variants: {some: {isActive: true, finish: {contains: w, mode: 'insensitive' as const}}}},
                              ],
                          })),
                      }
                    : {}),
            })
        ).filter(
            (c) =>
                (!query.newOnly || Date.now() - c.createdAt.getTime() < newProductDays * DAY) &&
                (!query.customizable || c.isCustomizable),
        );

        type Card = (typeof base)[number];
        const matches = (c: Card, skip?: string) =>
            (skip === 'category' || !cats.length || cats.includes((c.category ?? '').toLowerCase())) &&
            (skip === 'subcategory' || !subs.length || subs.includes((c.subcategory ?? '').toLowerCase())) &&
            (skip === 'brand' || !brands.length || brands.includes((c.brand ?? '').toLowerCase())) &&
            (skip === 'room' || !rooms.length || rooms.includes((c.room ?? '').toLowerCase())) &&
            (skip === 'material' || !materials.length || materials.includes((c.material ?? '').toLowerCase())) &&
            (skip === 'finish' || !finishes.length || c.finishes.some((f) => finishes.includes(f.toLowerCase()))) &&
            (skip === 'price' ||
                ((query.priceMin === undefined || c.price >= query.priceMin) &&
                    (query.priceMax === undefined || c.price <= query.priceMax))) &&
            (query.minDiscount === undefined || c.discountPct >= query.minDiscount) &&
            (!query.inStock || c.inStock);

        const items = base.filter((c) => matches(c));

        // Each facet counts with every other filter applied (but not itself)
        const count = (skip: string, keys: (c: Card) => string[]) => {
            const m = new Map<string, number>();
            for (const c of base.filter((x) => matches(x, skip))) {
                for (const k of new Set(keys(c).filter(Boolean))) m.set(k, (m.get(k) ?? 0) + 1);
            }
            return [...m.entries()].map(([value, n]) => ({value, count: n}));
        };
        const byCount = (a: {count: number}, b: {count: number}) => b.count - a.count;
        const priceBase = base.filter((x) => matches(x, 'price')).map((c) => c.price);

        const sorters: Record<(typeof SORTS)[number], (a: Card, b: Card) => number> = {
            popular: (a, b) => b.sold - a.sold || b.rating.count - a.rating.count,
            new: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            price_asc: (a, b) => a.price - b.price,
            price_desc: (a, b) => b.price - a.price,
            discount: (a, b) => b.discountPct - a.discountPct,
            rating: (a, b) => b.rating.avg - a.rating.avg || b.rating.count - a.rating.count,
        };
        // In-stock first, then the chosen order
        items.sort((a, b) => Number(b.inStock) - Number(a.inStock) || sorters[query.sort](a, b));

        const total = items.length;
        const start = (query.page - 1) * query.limit;
        return {
            items: items.slice(start, start + query.limit),
            pagination: {total, page: query.page, limit: query.limit, pages: Math.ceil(total / query.limit) || 1},
            facets: {
                categories: count('category', (c) => [c.category ?? '']).sort(byCount),
                subcategories: count('subcategory', (c) => [c.subcategory ?? '']).sort(byCount),
                brands: count('brand', (c) => [c.brand ?? '']).sort((a, b) => a.value.localeCompare(b.value)),
                rooms: count('room', (c) => [c.room ?? '']).sort(byCount),
                materials: count('material', (c) => [c.material ?? '']).sort(byCount),
                finishes: count('finish', (c) => c.finishes).sort(byCount),
                price: {
                    min: priceBase.length ? Math.floor(Math.min(...priceBase)) : 0,
                    max: priceBase.length ? Math.ceil(Math.max(...priceBase)) : 0,
                },
            },
        };
    }

    public async getProduct(idOrSlug: string) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
        const p = await prisma.product.findFirst({
            where: {...LISTED, ...(isUuid ? {id: idOrSlug} : {slug: idOrSlug})},
            include: {
                brand: {select: {name: true}},
                category: {select: {name: true}},
                subcategory: {select: {name: true}},
                shop: {select: {id: true, name: true, branchId: true, branch: {select: {name: true, city: true}}}},
                images: {orderBy: [{isMain: 'desc'}, {order: 'asc'}], select: {id: true, url: true, altText: true}},
                variants: {
                    where: {isActive: true},
                    orderBy: {createdAt: 'asc'},
                    select: {
                        id: true,
                        variantSku: true,
                        variantName: true,
                        finish: true,
                        image: true,
                        mrp: true,
                        sellingPrice: true,
                        inventories: {select: {branchId: true, physicalQty: true, reservedQty: true}},
                    },
                },
                reviews: {
                    orderBy: {createdAt: 'desc'},
                    take: 20,
                    select: {
                        id: true,
                        rating: true,
                        title: true,
                        comment: true,
                        images: true,
                        createdAt: true,
                        user: {select: {fullname: true}},
                    },
                },
            },
        });
        if (!p) throw new ApiError(httpStatus.NOT_FOUND, 'This product is not available');

        const branchId = p.shop!.branchId;
        const variants = p.variants.map((v) => {
            const price = v.sellingPrice ?? p.sellingPrice ?? p.mrp;
            const mrp = v.mrp ?? p.mrp;
            return {
                id: v.id,
                sku: v.variantSku,
                variantName: v.variantName,
                finish: v.finish,
                image: v.image,
                price,
                mrp,
                discountPct: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
                stock: stockOf(v, branchId),
            };
        });

        const agg = await prisma.productReview.groupBy({by: ['rating'], where: {productId: p.id}, _count: true});

        // Coupons the buyer can use on this product: made by its company, for all
        // branches or this one; same rules as at checkout
        const now = new Date();
        const offers = (
            await prisma.coupon.findMany({
                where: {
                    isActive: true,
                    startDate: {lte: now},
                    endDate: {gte: now},
                    AND: [
                        {OR: [{companyId: null}, {companyId: p.companyId}]},
                        {OR: [{shopId: null}, {shopId: p.shopId}]},
                        {OR: [{branchId: null}, {branchId}]},
                    ],
                },
                orderBy: {discountValue: 'desc'},
                take: 6,
                select: {
                    code: true,
                    name: true,
                    description: true,
                    type: true,
                    discountValue: true,
                    minPurchaseAmount: true,
                    maxDiscountLimit: true,
                    endDate: true,
                    usageLimit: true,
                    usedCount: true,
                },
            })
        )
            .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
            .slice(0, 3)
            .map(({usageLimit, usedCount, ...c}) => c);
        const reviewCount = agg.reduce((t, r) => t + r._count, 0);
        const avg = reviewCount ? round2(agg.reduce((t, r) => t + r.rating * r._count, 0) / reviewCount) : 0;

        const similar = (
            await this.cards({
                id: {not: p.id},
                // Only real ids: {subcategoryId: undefined} would match every product
                OR: [
                    ...(p.subcategoryId ? [{subcategoryId: p.subcategoryId}] : []),
                    ...(p.categoryId ? [{categoryId: p.categoryId}] : []),
                ],
            })
        )
            .sort((a, b) => Number(b.inStock) - Number(a.inStock) || b.sold - a.sold)
            .slice(0, 8);

        const price = variants.length ? Math.min(...variants.map((v) => v.price)) : p.sellingPrice || p.mrp;
        // The product's fixed rate, or its branch's GST price rule at the lowest price
        const taxRate = rateFor(await shopGstService.ruleOf(p.shopId!), p.taxRate, price);
        const dims = [p.lengthCm, p.widthCm, p.heightCm];

        return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            brand: p.brand?.name ?? null,
            category: p.category?.name ?? null,
            subcategory: p.subcategory?.name ?? null,
            shortDesc: p.shortDesc,
            description: p.detailedDesc,
            attributes: {
                productType: p.productType,
                room: p.roomType,
                material: p.material,
                finish: p.finish,
                colour: p.colour,
                unit: p.unit,
            },
            dimensions: dims.every((d) => d)
                ? {lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm}
                : null,
            weightKg: p.weightKg,
            specifications: Array.isArray(p.specifications) ? p.specifications : [],
            warranty: {months: p.warrantyMonths, terms: p.warrantyTerms},
            assemblyRequired: p.assemblyRequired,
            installationAvailable: p.installationAvailable,
            isCustomizable: p.isCustomizable,
            careInstructions: p.careInstructions,
            returnEligible: p.returnEligible,
            returnPeriodDays: p.returnPeriodDays,
            taxRate,
            images: p.images,
            mrp: p.mrp,
            price,
            finishes: [...new Set(variants.map((v) => v.finish))],
            variantNames: [...new Set(variants.map((v) => v.variantName))],
            variants,
            offers,
            shop: {name: p.shop!.branch.name, city: p.shop!.branch.city},
            rating: {
                avg,
                count: reviewCount,
                distribution: [5, 4, 3, 2, 1].map((star) => ({
                    star,
                    count: agg.find((a) => a.rating === star)?._count ?? 0,
                })),
            },
            reviews: p.reviews.map((r) => ({
                id: r.id,
                rating: r.rating,
                title: r.title,
                comment: r.comment,
                images: r.images,
                createdAt: r.createdAt,
                author:
                    r.user.fullname.split(' ')[0] +
                    (r.user.fullname.includes(' ') ? ` ${r.user.fullname.split(' ').pop()![0]}.` : ''),
            })),
            similar,
        };
    }

    public async suggest(q: string) {
        const term = q.trim();
        if (term.length < 2) return {suggestions: [], products: []};
        const cards = await this.cards({
            OR: [
                {name: {contains: term, mode: 'insensitive'}},
                {productType: {contains: term, mode: 'insensitive'}},
                {material: {contains: term, mode: 'insensitive'}},
                {category: {name: {contains: term, mode: 'insensitive'}}},
                {subcategory: {name: {contains: term, mode: 'insensitive'}}},
                {brand: {name: {contains: term, mode: 'insensitive'}}},
            ],
        });
        // "teak in Bedroom · Beds" style lines, grouped by room and category
        const byCat = new Map<string, number>();
        for (const c of cards) {
            const key = [c.room, c.subcategory ?? c.category ?? ''].filter(Boolean).join(' · ');
            byCat.set(key, (byCat.get(key) ?? 0) + 1);
        }
        return {
            suggestions: [...byCat.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([where, count]) => ({text: term.toLowerCase(), where, count})),
            products: cards.sort((a, b) => Number(b.inStock) - Number(a.inStock) || b.sold - a.sold).slice(0, 4),
        };
    }

    public async home() {
        const all = await this.cards({});
        const activeCoupons = await prisma.coupon.findMany({
            where: {isActive: true, startDate: {lte: new Date()}, endDate: {gte: new Date()}},
            orderBy: {discountValue: 'desc'},
            take: 2,
            select: {
                code: true,
                name: true,
                description: true,
                type: true,
                discountValue: true,
                minPurchaseAmount: true,
                maxDiscountLimit: true,
                endDate: true,
            },
        });

        const catCount = new Map<string, {count: number; image: string | null}>();
        for (const c of all) {
            if (!c.category) continue;
            const cur = catCount.get(c.category);
            catCount.set(c.category, {count: (cur?.count ?? 0) + 1, image: cur?.image ?? c.image});
        }
        const roomCount = new Map<string, {count: number; image: string | null}>();
        for (const c of all) {
            if (!c.room) continue;
            const cur = roomCount.get(c.room);
            roomCount.set(c.room, {count: (cur?.count ?? 0) + 1, image: cur?.image ?? c.image});
        }
        const top = (list: typeof all) =>
            [...list].sort((a, b) => Number(b.inStock) - Number(a.inStock) || b.sold - a.sold).slice(0, 8);

        return {
            categories: [...catCount.entries()]
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 8)
                .map(([name, v]) => ({name, count: v.count, image: v.image})),
            rooms: [...roomCount.entries()]
                .sort((a, b) => b[1].count - a[1].count)
                .map(([name, v]) => ({name, count: v.count, image: v.image})),
            newArrivals: [...all]
                .sort(
                    (a, b) =>
                        Number(b.inStock) - Number(a.inStock) || b.createdAt.getTime() - a.createdAt.getTime(),
                )
                .slice(0, 8),
            bestsellers: top(all),
            customizable: top(all.filter((c) => c.isCustomizable)),
            deals: top(all.filter((c) => c.discountPct >= 10)),
            coupons: activeCoupons,
            cities: [...new Set(all.map((c) => c.shop.city))].slice(0, 6),
        };
    }

    /**
     * Delivery estimate for a pincode. The days and fees are the store settings;
     * furniture is delivered and installed by the branch team.
     */
    public async deliveryEstimate(pincode: string) {
        if (!/^[1-9]\d{5}$/.test(pincode)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a valid 6-digit pincode');
        }
        const s = await storeSettingsService.get();
        const by = (days: number) => {
            const d = new Date(Date.now() + days * DAY);
            return d.toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'});
        };
        return {
            pincode,
            standard: {by: by(s.deliveryDaysStd), fee: 0, freeAbove: s.freeDeliveryAbove, feeBelow: s.deliveryFee},
            express: {by: by(s.deliveryDaysExpress), fee: s.expressFee},
            cod: true,
            returns: 'Easy returns and replacement for damaged or defective items, as shown on each product',
        };
    }
}

export default new CatalogService();
