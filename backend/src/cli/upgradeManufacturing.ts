/**
 * One-time upgrade of an existing demo database to the business-line and
 * manufacturing model, without wiping anything:
 *   - categories renamed to the three business lines (Furniture, Electronics, Crockery & Utensils)
 *   - every product tagged with its business line and sourcing
 *   - rack numbers on stock rows that have none
 *   - two crockery items (bartan set, dinner set) with opening stock
 *   - bills of materials and sample work orders / a delivery in the Pune workshop
 * Safe to run twice: each step skips what is already there.
 *
 *   node --env-file=.env -r ts-node/register/transpile-only -r tsconfig-paths/register src/cli/upgradeManufacturing.ts
 */
import path from 'path';
import {Role} from '@prisma/client';
import prisma from '../client';
import {config} from '@config/index';
import {billValidation, shopProductValidation} from '../validations';
import manufacturingValidation from '../validations/manufacturing.validation';
import shopProductService from '../services/shopProduct.service';
import billService from '../services/bill.service';
import manufacturingService from '../services/manufacturing.service';
import deliveryService from '../services/delivery.service';
import {renderArt} from './furnitureArt';

const PHOTO_DIR = path.join(__dirname, '../../public/uploads/products/demo');
const ASSET_BASE = (process.env.ASSET_BASE_URL ?? `http://localhost:${config.port}`).replace(/\/$/, '');
const photoUrl = (file: string) => `${ASSET_BASE}/uploads/products/demo/${file}`;
const DAY = 86_400_000;
const day = (n: number) => new Date(Date.now() + n * DAY);
const log = (s: string) => console.log(`  ${s}`);

const ELECTRONICS = ['Ceiling Fans', 'Lighting'];
const CROCKERY = ['Cookware', 'Utensils', 'Dinnerware'];

const main = async () => {
    const company = await prisma.company.findFirst({where: {name: 'Woodcraft Interiors', deletedAt: null}, select: {id: true}});
    if (!company) throw new Error('Demo company not found. Run npm run seed:demo on a fresh database instead.');

    // ---- 1. Categories -> business lines
    const renames: [string, string][] = [['Electrical', 'Electronics'], ['Kitchenware', 'Crockery & Utensils']];
    for (const [from, to] of renames) {
        const r = await prisma.category.updateMany({where: {companyId: company.id, name: from}, data: {name: to}});
        if (r.count) log(`Category "${from}" renamed to "${to}"`);
    }
    const crockeryCat = await prisma.category.findFirst({where: {companyId: company.id, name: 'Crockery & Utensils'}, select: {id: true}});
    const subIds: Record<string, string> = {};
    if (crockeryCat) {
        for (const name of ['Utensils', 'Dinnerware']) {
            const existing = await prisma.subcategory.findFirst({where: {companyId: company.id, name}, select: {id: true}});
            subIds[name] =
                existing?.id ??
                (
                    await prisma.subcategory.create({
                        data: {name, code: `SUB-${name.slice(0, 3).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`, companyId: company.id, categoryId: crockeryCat.id},
                        select: {id: true},
                    })
                ).id;
        }
    }

    // ---- 2. Business line and sourcing of every product
    const products = await prisma.product.findMany({
        where: {companyId: company.id, deletedAt: null},
        select: {id: true, productKind: true, brand: {select: {name: true}}, subcategory: {select: {name: true}}},
    });
    for (const p of products) {
        const sub = p.subcategory?.name ?? '';
        const businessLine = ELECTRONICS.includes(sub) ? 'ELECTRONICS' : CROCKERY.includes(sub) ? 'CROCKERY' : 'FURNITURE';
        const sourcing = p.productKind === 'FINISHED_GOOD' && businessLine === 'FURNITURE' && p.brand?.name === 'Woodcraft Signature' ? 'MANUFACTURED' : 'TRADED';
        await prisma.product.update({where: {id: p.id}, data: {businessLine, sourcing}});
    }
    log(`${products.length} products tagged with business line and sourcing`);

    // ---- Branches
    const branchOf = async (city: string) => {
        const b = await prisma.branch.findFirst({where: {companyId: company.id, city, deletedAt: null}, select: {id: true, shops: {select: {id: true}, take: 1}}});
        const mgr = await prisma.user.findFirst({where: {branchId: b!.id, role: Role.BRANCH_MANAGER}, select: {id: true, fullname: true}});
        return {id: b!.id, shopId: b!.shops[0].id, manager: mgr!, scope: {companyId: company.id, shopId: b!.shops[0].id}};
    };
    const pune = await branchOf('Pune');
    const mumbai = await branchOf('Mumbai');

    // ---- 3. Crockery items with opening stock
    const brand = await prisma.brand.findFirst({where: {companyId: company.id, name: 'ChefPro'}, select: {id: true}});
    const crockery = [
        {name: 'Classic Steel Bartan Set', sub: 'Utensils', type: 'Utensil Set', material: 'Stainless Steel', room: 'Kitchen', variants: ['12 Piece', '8 Piece'], finish: 'Brushed Steel', mrp: 3499, price: 2799, wholesale: 2450, cost: 1900, warranty: 12, hsn: '7323', specs: [['Pieces', 'Kadai, tope, patila, plates, bowls'], ['Gauge', '22 gauge']], desc: 'Everyday stainless steel bartan set: kadai, topes, patila, plates and bowls.', tags: ['bartan', 'utensils', 'steel'], branches: [pune, mumbai]},
        {name: 'Royal Bone China Dinner Set', sub: 'Dinnerware', type: 'Dinner Set', material: 'Bone China', room: 'Dining', variants: ['33 Piece', '21 Piece'], finish: 'Copper', mrp: 7999, price: 6299, wholesale: 5600, cost: 4200, warranty: 0, hsn: '6911', specs: [['Pieces', 'Plates, bowls, serving dishes'], ['Microwave safe', 'Yes']], desc: 'Fine bone china dinner set with gold rim, for six.', tags: ['crockery', 'dinner set'], branches: [pune]},
    ];
    for (const item of crockery) {
        for (const b of item.branches) {
            if (await prisma.product.findFirst({where: {shopId: b.shopId, name: item.name, deletedAt: null}, select: {id: true}})) continue;
            const p = await shopProductService.create(
                b.scope,
                b.manager.id,
                shopProductValidation.createShopProductSchema.parse({
                    name: item.name, detailedDesc: item.desc, shortDesc: item.desc.split('.')[0],
                    categoryId: crockeryCat!.id, subcategoryId: subIds[item.sub], brandId: brand?.id,
                    productKind: 'FINISHED_GOOD', businessLine: 'CROCKERY', sourcing: 'TRADED',
                    productType: item.type, roomType: item.room, material: item.material, finish: item.finish,
                    specifications: item.specs.map(([key, value]) => ({key, value})),
                    warrantyMonths: item.warranty, unit: 'SET', mrp: item.mrp, sellingPrice: item.price, wholesalePrice: item.wholesale, purchasePrice: item.cost,
                    status: 'PUBLISHED', tags: item.tags, taxRate: 12, hsnCode: item.hsn,
                    variants: item.variants.map((variantName, vi) => ({
                        variantName,
                        finish: item.finish,
                        ...(vi > 0 ? {mrp: Math.round(item.mrp * 0.72), sellingPrice: Math.round(item.price * 0.72), wholesalePrice: Math.round(item.wholesale * 0.72)} : {}),
                    })),
                }),
            );
            const file = await renderArt(PHOTO_DIR, 'cookware', item.finish);
            await prisma.productImage.create({data: {productId: p.id, url: photoUrl(file), order: 0, isMain: true, altText: item.name}});
            await prisma.productVariant.updateMany({where: {productId: p.id}, data: {image: photoUrl(file)}});
            const variants = await prisma.productVariant.findMany({where: {productId: p.id}, select: {id: true}});
            await billService.createPurchase(
                b.scope,
                b.manager.id,
                billValidation.createPurchaseBillSchema.parse({
                    supplierName: 'Mumbai Electricals & Home', supplierPhone: '9800000303', supplierInvoiceNo: `MUM-CR-${item.sub.slice(0, 3).toUpperCase()}`,
                    items: variants.map((v) => ({variantId: v.id, quantity: 12, unitCost: item.cost, taxRate: 12})), paymentMode: 'UPI',
                }),
            );
            log(`Added ${item.name} with stock`);
        }
    }

    // ---- 4. Racks on stock rows without one
    for (const b of [pune, mumbai]) {
        const rows = await prisma.inventory.findMany({
            where: {branchId: b.id, rackNo: null},
            select: {id: true, variant: {select: {product: {select: {productKind: true, businessLine: true}}}}},
            orderBy: {createdAt: 'asc'},
        });
        for (const [i, r] of rows.entries()) {
            const k = r.variant.product.productKind;
            const rack =
                k === 'FINISHED_GOOD'
                    ? r.variant.product.businessLine === 'FURNITURE'
                        ? `SR-${String.fromCharCode(65 + (i % 6))}${1 + (i % 4)}`
                        : `SH-${1 + (i % 3)}`
                    : `GD-R${1 + (i % 5)}`;
            await prisma.inventory.update({where: {id: r.id}, data: {rackNo: rack}});
        }
        log(`${rows.length} stock rows given a rack in ${b.id === pune.id ? 'Pune' : 'Mumbai'}`);
    }

    // ---- 5. Manufacturing in the Pune workshop
    if (await prisma.workOrder.count({where: {branchId: pune.id}})) {
        log('Work orders already exist: manufacturing samples skipped');
    } else {
        const pid = async (name: string) => (await prisma.product.findFirst({where: {shopId: pune.shopId, name, deletedAt: null}, select: {id: true}}))!.id;
        const pv = async (name: string) => (await prisma.productVariant.findFirst({where: {productId: await pid(name)}, orderBy: {createdAt: 'asc'}, select: {id: true}}))!;
        const raw = {
            ply: await pv('BWP Marine Plywood 18mm'),
            hinge: await pv('Soft-Close Hinge Pack'),
            foam: await pv('HR Foam Sheet 40 Density'),
            polish: await pv('Melamine Wood Polish'),
        };
        const boms: Record<string, {v: {id: string}; q: number; w?: number}[]> = {
            'Aspen 3-Seater Fabric Sofa': [{v: raw.ply, q: 1.5, w: 10}, {v: raw.foam, q: 3, w: 5}, {v: raw.polish, q: 0.5}],
            'Regal Sheesham King Bed': [{v: raw.ply, q: 3, w: 10}, {v: raw.polish, q: 1}],
            'Vista 3-Door Wardrobe': [{v: raw.ply, q: 4, w: 12}, {v: raw.hinge, q: 1}, {v: raw.polish, q: 1}],
            'Heritage 6-Seater Dining Set': [{v: raw.ply, q: 2, w: 10}, {v: raw.foam, q: 1}, {v: raw.polish, q: 1.5}],
            'Classic Buffet Sideboard': [{v: raw.ply, q: 2, w: 10}, {v: raw.hinge, q: 1}, {v: raw.polish, q: 1}],
        };
        for (const [name, lines] of Object.entries(boms)) {
            await manufacturingService.setBom(pune.scope, await pid(name), lines.map((l) => ({materialVariantId: l.v.id, quantity: l.q, wastagePct: l.w ?? 0})));
        }
        const mgr = pune.manager;
        const team = await prisma.user.findMany({where: {branchId: pune.id, role: Role.EMPLOYEE}, select: {id: true}, orderBy: {createdAt: 'asc'}});
        const runStages = async (id: string, count: number) => {
            const wo = await manufacturingService.get(pune.scope, id);
            for (const st of wo.stages.slice(0, count)) await manufacturingService.setStage(pune.scope, mgr, id, st.key, true);
        };
        const parse = manufacturingValidation.createWorkOrderSchema.parse;

        const wo1 = await manufacturingService.create(pune.scope, mgr.id, parse({
            type: 'MADE_TO_STOCK', productId: await pid('Aspen 3-Seater Fabric Sofa'), variantId: (await pv('Aspen 3-Seater Fabric Sofa')).id, title: 'Aspen 3-Seater Fabric Sofa', quantity: 4,
            dueDate: day(2).toISOString(), assignedToId: team[0]?.id, labourCost: 14000, overheadCost: 3000,
        }));
        await manufacturingService.issue(pune.scope, mgr.id, wo1.id);
        await runStages(wo1.id, 6);
        await manufacturingService.qc(pune.scope, wo1.id, true, 'Stitching and polish checked');
        await manufacturingService.complete(pune.scope, mgr.id, wo1.id, 'SR-A2');

        const wo2 = await manufacturingService.create(pune.scope, mgr.id, parse({
            type: 'MADE_TO_STOCK', productId: await pid('Regal Sheesham King Bed'), variantId: (await pv('Regal Sheesham King Bed')).id, title: 'Regal Sheesham King Bed', quantity: 2,
            priority: 'HIGH', dueDate: day(5).toISOString(), assignedToId: team[1]?.id ?? team[0]?.id, labourCost: 9000,
        }));
        await manufacturingService.issue(pune.scope, mgr.id, wo2.id);
        await runStages(wo2.id, 3);

        const bedPhoto = photoUrl(await renderArt(PHOTO_DIR, 'bed', 'Walnut'));
        await manufacturingService.create(pune.scope, mgr.id, parse({
            type: 'MADE_TO_ORDER', title: 'Custom king bed with hydraulic storage', quantity: 1, priority: 'URGENT',
            customerName: 'Neha Joshi', customerPhone: '9822001144', customerAddress: '402, Silver Oak, Baner, Pune 411045',
            category: 'Beds', productType: 'Bed', lengthCm: 213, widthCm: 198, heightCm: 110, sizeNote: 'King 6.5 x 7 ft (room is 12 x 11 ft)',
            material: 'Sheesham Wood', finish: 'Walnut', colour: 'Dark walnut, beige headboard',
            accessories: [{name: 'Hydraulic storage', quantity: 1, price: 6500}, {name: 'Cushioned headboard', quantity: 1, price: 4500}, {name: 'Side tables (pair)', quantity: 1, price: 7000}],
            designImages: [bedPhoto], specNotes: 'Low-height platform, rounded corners. Headboard in beige fabric to match the curtains.',
            materials: [{variantId: raw.ply.id, plannedQty: 4}, {variantId: raw.foam.id, plannedQty: 1}, {variantId: raw.polish.id, plannedQty: 1}],
            dueDate: day(18).toISOString(), labourCost: 12000, overheadCost: 2500, quotedPrice: 92000, advancePaid: 30000,
            notes: 'Advance by UPI. Confirm finish sample before polish.',
        }));

        const wo4 = await manufacturingService.create(pune.scope, mgr.id, parse({
            type: 'MADE_TO_ORDER', title: 'Custom 4-door sliding wardrobe', quantity: 1,
            customerName: 'Amit Deshpande', customerPhone: '9822003311', customerAddress: '12, Kalpataru Society, Kothrud, Pune 411038',
            category: 'Wardrobes', productType: 'Wardrobe', lengthCm: 240, widthCm: 60, heightCm: 210, sizeNote: '8 ft wide, ceiling height',
            material: 'BWP Plywood', finish: 'Oak laminate', accessories: [{name: 'Mirror on one shutter', quantity: 1, price: 3500}],
            materials: [{variantId: raw.ply.id, plannedQty: 6}, {variantId: raw.hinge.id, plannedQty: 2}, {variantId: raw.polish.id, plannedQty: 1}],
            dueDate: day(1).toISOString(), labourCost: 15000, overheadCost: 3000, quotedPrice: 78000, advancePaid: 40000,
        }));
        await manufacturingService.issue(pune.scope, mgr.id, wo4.id);
        await runStages(wo4.id, 6);
        await manufacturingService.qc(pune.scope, wo4.id, true, 'Shutters aligned, soft-close OK');
        await manufacturingService.complete(pune.scope, mgr.id, wo4.id);
        await deliveryService.create(pune.scope, mgr.id, manufacturingValidation.createDeliverySchema.parse({
            workOrderId: wo4.id, customerName: 'Amit Deshpande', customerPhone: '9822003311', address: '12, Kalpataru Society, Kothrud', city: 'Pune', postalCode: '411038',
            items: [{name: 'Custom 4-door sliding wardrobe', quantity: 1}], scheduledDate: day(1).toISOString(), slot: 'MORNING', installation: true, assignedToId: team.at(-1)?.id,
            notes: 'Third floor, lift available. Carry installation kit.',
        }));
        log('Manufacturing: 5 bills of materials, 4 work orders, 1 delivery');
    }
    console.log('Upgrade done.');
};

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
