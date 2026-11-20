/**
 * Demo data for the store and the panels: a furniture company with two
 * branches, staff, a catalog with illustrated product photos, stock, counter
 * sales (retail and wholesale), quotations, customers and online orders.
 *
 *   npm run seed:demo        create the demo company (skips if it exists)
 *
 * To start over: `npx prisma migrate reset` (drops every row), then
 * `npm run create:superadmin` and `npm run seed:demo`.
 *
 * Everything goes through the app's own services, exactly as the screens
 * would, so stock, GST, bill numbers, customer dues and order history are real.
 * All demo logins use the password Pass@123.
 */
import path from 'path';
import {AccountStatus, OrderStatus, ProductKind, Role} from '@prisma/client';
import prisma from '../client';
import {config} from '@config/index';
import {encryptPassword} from '../utils/encryption';
import {billValidation, catalogValidation, companyValidation, masterValidation, orgValidation, shopProductValidation} from '../validations';
import quotationValidation from '../validations/quotation.validation';
import manufacturingValidation from '../validations/manufacturing.validation';
import manufacturingService from '../services/manufacturing.service';
import deliveryService from '../services/delivery.service';
import companyService from '../services/company.service';
import branchService from '../services/branch.service';
import employeeService from '../services/employee.service';
import masterService from '../services/master.service';
import categoryBrandService from '../services/categoryBrand.service';
import shopProductService from '../services/shopProduct.service';
import billService from '../services/bill.service';
import quotationService from '../services/quotation.service';
import orderService from '../services/order.service';
import customerService from '../services/store/customer.service';
import checkoutService from '../services/store/checkout.service';
import {ArtKind, renderArt} from './furnitureArt';

const PASSWORD = 'Pass@123';
const COMPANY_EMAIL = 'demo.company@furnipro.in';
const DAY = 86_400_000;
const log = (s: string) => console.log(`  ${s}`);

// Photos are served by this API at /uploads/...; the store and panels run on other ports, so URLs are absolute
const PHOTO_DIR = path.join(__dirname, '../../public/uploads/products/demo');
const ASSET_BASE = (process.env.ASSET_BASE_URL ?? `http://localhost:${config.port}`).replace(/\/$/, '');
const photoUrl = (file: string) => `${ASSET_BASE}/uploads/products/demo/${file}`;

type Item = {
    name: string;
    sub: string;
    brand: string;
    art: ArtKind;
    kind?: ProductKind;
    room?: string;
    type: string;
    material: string;
    /** variant names x finishes = the sellable variants */
    variants: string[];
    finishes: string[];
    mrp: number;
    price: number;
    wholesale: number;
    cost: number;
    gst: number;
    hsn: string;
    warranty: number;
    dims?: [number, number, number];
    unit?: string;
    customizable?: boolean;
    assembly?: boolean;
    install?: boolean;
    specs: [string, string][];
    desc: string;
    tags: string[];
    /** Also stocked in the Mumbai branch */
    mumbai?: boolean;
};

/** Electronics and crockery are bought and sold; our own furniture brand is made in the workshop */
const lineOf = (item: Item) =>
    ['Ceiling Fans', 'Lighting'].includes(item.sub) ? 'ELECTRONICS' : ['Cookware', 'Utensils', 'Dinnerware'].includes(item.sub) ? 'CROCKERY' : 'FURNITURE';
const sourcingOf = (item: Item) =>
    item.kind || lineOf(item) !== 'FURNITURE' ? 'TRADED' : item.brand === 'Woodcraft Signature' ? 'MANUFACTURED' : 'TRADED';

const CATEGORIES: {name: string; subs: string[]}[] = [
    {name: 'Furniture', subs: ['Sofas', 'Armchairs', 'Beds', 'Wardrobes', 'Dining Sets', 'Dining Chairs', 'Coffee Tables', 'TV Units', 'Sideboards', 'Office Chairs', 'Study Desks', 'Bookshelves', 'Modular Kitchen']},
    {name: 'Electronics', subs: ['Ceiling Fans', 'Lighting']},
    {name: 'Crockery & Utensils', subs: ['Cookware', 'Utensils', 'Dinnerware']},
    {name: 'Raw Materials', subs: ['Plywood & Boards', 'Hardware', 'Foam & Upholstery', 'Polish & Finishes']},
];

const ITEMS: Item[] = [
    {name: 'Aspen 3-Seater Fabric Sofa', sub: 'Sofas', brand: 'Woodcraft Signature', art: 'sofa', room: 'Living Room', type: 'Sofa', material: 'Solid Wood Frame', variants: ['3 Seater', '2 Seater'], finishes: ['Grey Fabric', 'Navy Velvet', 'Beige Fabric'], mrp: 58999, price: 45999, wholesale: 39999, cost: 28000, gst: 18, hsn: '9401', warranty: 36, dims: [210, 90, 85], customizable: true, specs: [['Seating Capacity', '3'], ['Frame', 'Kiln-dried sheesham'], ['Cushion', 'High-resilience foam, 40 density'], ['Fabric', 'Stain-resistant polyester']], desc: 'Deep-seated sofa with a kiln-dried sheesham frame, high-resilience foam and stain-resistant upholstery. Built for everyday family lounging.', tags: ['sofa', 'living room', 'fabric'], mumbai: true},
    {name: 'Milano L-Shape Sectional Sofa', sub: 'Sofas', brand: 'UrbanNest', art: 'sofa', room: 'Living Room', type: 'Sofa', material: 'Engineered Wood Frame', variants: ['Left Facing', 'Right Facing'], finishes: ['Olive Fabric', 'Rust Fabric'], mrp: 84999, price: 69999, wholesale: 61999, cost: 44000, gst: 18, hsn: '9401', warranty: 36, dims: [270, 170, 88], customizable: true, specs: [['Seating Capacity', '5'], ['Cushion', 'Fibre-filled back cushions'], ['Legs', 'Solid wood, walnut finish']], desc: 'Spacious L-shape sectional with a chaise, fibre-filled back cushions and tapered wooden legs.', tags: ['sectional', 'l shape', 'sofa'], mumbai: true},
    {name: 'Oslo Wingback Armchair', sub: 'Armchairs', brand: 'Havenly Home', art: 'armchair', room: 'Living Room', type: 'Armchair', material: 'Solid Wood', variants: ['Standard'], finishes: ['Navy Velvet', 'Tan Leather', 'Beige Fabric'], mrp: 24999, price: 18999, wholesale: 16499, cost: 11000, gst: 18, hsn: '9401', warranty: 24, dims: [78, 82, 102], specs: [['Seat Height', '45 cm'], ['Upholstery', 'Velvet / leatherette']], desc: 'Classic wingback with a high back, plush seat and splayed wooden legs. A reading corner essential.', tags: ['armchair', 'accent chair']},
    {name: 'Regal Sheesham King Bed', sub: 'Beds', brand: 'Woodcraft Signature', art: 'bed', room: 'Bedroom', type: 'Bed', material: 'Sheesham Wood', variants: ['King 6x6.5 ft', 'Queen 5x6.5 ft'], finishes: ['Walnut', 'Honey'], mrp: 72999, price: 56999, wholesale: 49999, cost: 34000, gst: 18, hsn: '9403', warranty: 60, dims: [198, 213, 110], customizable: true, assembly: true, install: true, specs: [['Storage', 'Hydraulic box storage'], ['Wood', 'Solid sheesham'], ['Mattress', 'Not included']], desc: 'Solid sheesham bed with a panelled headboard and hydraulic box storage under the platform. Installed free by our team.', tags: ['bed', 'king bed', 'storage bed'], mumbai: true},
    {name: 'Nova Upholstered Queen Bed', sub: 'Beds', brand: 'UrbanNest', art: 'bed', room: 'Bedroom', type: 'Bed', material: 'Engineered Wood', variants: ['Queen 5x6.5 ft'], finishes: ['Grey Fabric', 'Beige Fabric'], mrp: 42999, price: 34999, wholesale: 30499, cost: 21000, gst: 18, hsn: '9403', warranty: 36, dims: [168, 213, 115], assembly: true, install: true, specs: [['Headboard', 'Padded, channel-tufted'], ['Storage', 'No storage']], desc: 'Soft upholstered queen bed with a channel-tufted headboard.', tags: ['bed', 'upholstered']},
    {name: 'Vista 3-Door Wardrobe', sub: 'Wardrobes', brand: 'Woodcraft Signature', art: 'wardrobe', room: 'Bedroom', type: 'Wardrobe', material: 'Engineered Wood', variants: ['3 Door', '2 Door'], finishes: ['Wenge Dark', 'Matte White', 'Oak'], mrp: 38999, price: 29999, wholesale: 25999, cost: 17500, gst: 18, hsn: '9403', warranty: 36, dims: [135, 58, 200], customizable: true, assembly: true, install: true, specs: [['Shelves', '6'], ['Hanging Space', 'Yes'], ['Locker', 'Internal drawer with lock']], desc: 'Three-door wardrobe with full-length hanging, six shelves and a locking drawer. Made to measure on request.', tags: ['wardrobe', 'almirah', 'storage'], mumbai: true},
    {name: 'Heritage 6-Seater Dining Set', sub: 'Dining Sets', brand: 'Woodcraft Signature', art: 'dining', room: 'Dining', type: 'Dining Set', material: 'Teak Wood', variants: ['6 Seater', '4 Seater'], finishes: ['Teak Natural', 'Walnut'], mrp: 89999, price: 72999, wholesale: 64999, cost: 46000, gst: 18, hsn: '9403', warranty: 60, dims: [180, 90, 76], customizable: true, assembly: true, install: true, specs: [['Table Top', 'Solid teak'], ['Chairs', 'Cushioned seats'], ['Seats', '6']], desc: 'Solid teak dining table with six cushioned chairs. Hand-finished with a natural melamine polish.', tags: ['dining table', 'dining set'], mumbai: true},
    {name: 'Cafe Cross-Back Dining Chair', sub: 'Dining Chairs', brand: 'Havenly Home', art: 'diningChair', room: 'Dining', type: 'Dining Chair', material: 'Rubber Wood', variants: ['Set of 2'], finishes: ['Walnut', 'Honey', 'Matte Black'], mrp: 12999, price: 9499, wholesale: 8199, cost: 5200, gst: 18, hsn: '9401', warranty: 12, specs: [['Pieces', '2 chairs'], ['Seat', 'Padded fabric']], desc: 'Bistro-style cross-back chairs with a padded seat, sold as a pair.', tags: ['chair', 'dining chair']},
    {name: 'Orbit Round Coffee Table', sub: 'Coffee Tables', brand: 'UrbanNest', art: 'coffeeTable', room: 'Living Room', type: 'Coffee Table', material: 'Mango Wood', variants: ['Standard'], finishes: ['Walnut', 'Natural'], mrp: 15999, price: 11999, wholesale: 10499, cost: 6500, gst: 18, hsn: '9403', warranty: 12, dims: [90, 90, 42], specs: [['Shape', 'Round'], ['Shelf', 'Lower shelf']], desc: 'Round mango-wood coffee table with a lower display shelf.', tags: ['coffee table', 'centre table']},
    {name: 'Linea Wall TV Unit', sub: 'TV Units', brand: 'UrbanNest', art: 'tvUnit', room: 'Living Room', type: 'TV Unit', material: 'Engineered Wood', variants: ['180 cm', '150 cm'], finishes: ['Oak', 'Wenge Dark'], mrp: 22999, price: 17499, wholesale: 15299, cost: 9800, gst: 18, hsn: '9403', warranty: 24, dims: [180, 40, 50], assembly: true, specs: [['TV Size', 'Up to 65"'], ['Storage', '3 cabinets']], desc: 'Low-line TV unit for TVs up to 65 inches, with three cabinets and cable management.', tags: ['tv unit', 'entertainment unit'], mumbai: true},
    {name: 'Classic Buffet Sideboard', sub: 'Sideboards', brand: 'Woodcraft Signature', art: 'sideboard', room: 'Dining', type: 'Sideboard', material: 'Sheesham Wood', variants: ['4 Door'], finishes: ['Honey', 'Walnut'], mrp: 34999, price: 27999, wholesale: 24499, cost: 16000, gst: 18, hsn: '9403', warranty: 36, dims: [160, 45, 80], specs: [['Doors', '4'], ['Shelves', 'Adjustable']], desc: 'Four-door sheesham sideboard with adjustable shelves and brass knobs.', tags: ['sideboard', 'buffet', 'storage']},
    {name: 'ErgoPro Mesh Office Chair', sub: 'Office Chairs', brand: 'UrbanNest', art: 'officeChair', room: 'Office', type: 'Office Chair', material: 'Mesh & Nylon', variants: ['High Back', 'Mid Back'], finishes: ['Matte Black', 'Grey Fabric'], mrp: 16999, price: 12499, wholesale: 10999, cost: 7200, gst: 18, hsn: '9401', warranty: 36, dims: [65, 65, 120], assembly: true, specs: [['Lumbar Support', 'Adjustable'], ['Armrest', '3D'], ['Recline', '135°']], desc: 'Ergonomic mesh chair with adjustable lumbar support, 3D armrests and 135° recline.', tags: ['office chair', 'ergonomic'], mumbai: true},
    {name: 'Scholar Study Desk', sub: 'Study Desks', brand: 'Havenly Home', art: 'studyDesk', room: 'Office', type: 'Study Desk', material: 'Engineered Wood', variants: ['120 cm'], finishes: ['Oak', 'Matte White'], mrp: 14999, price: 10999, wholesale: 9599, cost: 6100, gst: 18, hsn: '9403', warranty: 24, dims: [120, 60, 75], assembly: true, specs: [['Drawers', '3'], ['Cable Port', 'Yes']], desc: 'Compact study desk with a three-drawer pedestal and a cable port.', tags: ['study table', 'desk', 'work from home']},
    {name: 'Tiered Open Bookshelf', sub: 'Bookshelves', brand: 'Havenly Home', art: 'bookshelf', room: 'Office', type: 'Bookshelf', material: 'Engineered Wood', variants: ['4 Shelf'], finishes: ['Walnut', 'Oak'], mrp: 11999, price: 8999, wholesale: 7799, cost: 4900, gst: 18, hsn: '9403', warranty: 12, dims: [90, 30, 180], assembly: true, specs: [['Shelves', '4'], ['Load per Shelf', '20 kg']], desc: 'Four-tier open bookshelf with a back panel; each shelf holds 20 kg.', tags: ['bookshelf', 'storage']},
    {name: 'Breeze 1200mm BLDC Ceiling Fan', sub: 'Ceiling Fans', brand: 'Breeze Electricals', art: 'fan', room: 'Living Room', type: 'Ceiling Fan', material: 'Aluminium', variants: ['1200 mm'], finishes: ['Matte White', 'Brushed Steel', 'Matte Black'], mrp: 5999, price: 4299, wholesale: 3799, cost: 2700, gst: 18, hsn: '8414', warranty: 60, install: true, specs: [['Motor', 'BLDC, 28 W'], ['Speed', '350 RPM'], ['Remote', 'Included']], desc: 'Energy-saving BLDC ceiling fan with remote, 28 W at full speed. 5-year warranty.', tags: ['fan', 'ceiling fan', 'bldc'], mumbai: true},
    {name: 'Dome Pendant Light', sub: 'Lighting', brand: 'Breeze Electricals', art: 'pendantLamp', room: 'Dining', type: 'Pendant Light', material: 'Metal', variants: ['Single'], finishes: ['Matte Black', 'Gold', 'Copper'], mrp: 4499, price: 3299, wholesale: 2899, cost: 1900, gst: 18, hsn: '9405', warranty: 12, install: true, specs: [['Holder', 'E27'], ['Bulb', 'Not included']], desc: 'Metal dome pendant for dining tables and kitchen islands.', tags: ['pendant', 'light', 'lamp']},
    {name: 'Lumen Floor Lamp', sub: 'Lighting', brand: 'Breeze Electricals', art: 'floorLamp', room: 'Living Room', type: 'Floor Lamp', material: 'Metal & Linen', variants: ['Standard'], finishes: ['Gold', 'Matte Black'], mrp: 6999, price: 5199, wholesale: 4599, cost: 3000, gst: 18, hsn: '9405', warranty: 12, dims: [40, 40, 160], specs: [['Shade', 'Linen'], ['Switch', 'Foot switch']], desc: 'Tall floor lamp with a linen shade and foot switch.', tags: ['floor lamp', 'lighting']},
    {name: 'ChefPro Tri-Ply Cookware Set', sub: 'Cookware', brand: 'ChefPro', art: 'cookware', room: 'Kitchen', type: 'Cookware Set', material: 'Stainless Steel', variants: ['5 Piece', '3 Piece'], finishes: ['Brushed Steel', 'Copper'], mrp: 8999, price: 6499, wholesale: 5699, cost: 3900, gst: 12, hsn: '7323', warranty: 60, specs: [['Base', 'Induction compatible'], ['Pieces', 'Kadai, pan, pot, 2 lids']], desc: 'Tri-ply stainless steel cookware, induction and gas compatible.', tags: ['cookware', 'kitchen', 'induction'], mumbai: true},
    {name: 'Modular Kitchen Base Cabinet', sub: 'Modular Kitchen', brand: 'ChefPro', art: 'kitchenCabinet', room: 'Kitchen', type: 'Kitchen Cabinet', material: 'BWP Plywood', variants: ['Per Running Foot'], finishes: ['Matte White', 'Oak', 'Walnut'], mrp: 4500, price: 3800, wholesale: 3400, cost: 2300, gst: 18, hsn: '9403', warranty: 120, unit: 'RFT', customizable: true, install: true, specs: [['Carcass', 'BWP plywood'], ['Shutter', 'Laminate / acrylic'], ['Hardware', 'Soft-close hinges']], desc: 'Made-to-measure modular kitchen base cabinets, priced per running foot. Measured and installed by our team.', tags: ['modular kitchen', 'kitchen cabinet']},
    {name: 'Classic Steel Bartan Set', sub: 'Utensils', brand: 'ChefPro', art: 'cookware', room: 'Kitchen', type: 'Utensil Set', material: 'Stainless Steel', variants: ['12 Piece', '8 Piece'], finishes: ['Brushed Steel'], mrp: 3499, price: 2799, wholesale: 2450, cost: 1900, gst: 12, hsn: '7323', warranty: 12, specs: [['Pieces', 'Kadai, tope, patila, plates, bowls'], ['Gauge', '22 gauge']], desc: 'Everyday stainless steel bartan set: kadai, topes, patila, plates and bowls.', tags: ['bartan', 'utensils', 'steel'], mumbai: true},
    {name: 'Royal Bone China Dinner Set', sub: 'Dinnerware', brand: 'ChefPro', art: 'cookware', room: 'Dining', type: 'Dinner Set', material: 'Bone China', variants: ['33 Piece', '21 Piece'], finishes: ['Copper'], mrp: 7999, price: 6299, wholesale: 5600, cost: 4200, gst: 12, hsn: '6911', warranty: 0, specs: [['Pieces', 'Plates, bowls, serving dishes'], ['Microwave safe', 'Yes']], desc: 'Fine bone china dinner set with gold rim, for six.', tags: ['crockery', 'dinner set']},
    // Raw materials (used in manufacturing, not sold online)
    {name: 'BWP Marine Plywood 18mm', sub: 'Plywood & Boards', brand: 'Woodcraft Signature', art: 'plywood', kind: ProductKind.RAW_MATERIAL, type: 'Plywood', material: 'Hardwood Plywood', variants: ['8x4 ft Sheet'], finishes: ['Natural'], mrp: 3800, price: 3600, wholesale: 3400, cost: 2900, gst: 18, hsn: '4412', warranty: 0, unit: 'SHEET', specs: [['Grade', 'IS 710 BWP'], ['Thickness', '18 mm']], desc: 'Boiling water proof marine plywood for carcasses and beds.', tags: ['plywood', 'raw material']},
    {name: 'Soft-Close Hinge Pack', sub: 'Hardware', brand: 'Woodcraft Signature', art: 'hardware', kind: ProductKind.HARDWARE, type: 'Hinge', material: 'Steel', variants: ['Pack of 10'], finishes: ['Brushed Steel'], mrp: 1800, price: 1600, wholesale: 1450, cost: 1100, gst: 18, hsn: '8302', warranty: 0, unit: 'SET', specs: [['Type', 'Clip-on, soft close']], desc: 'Clip-on soft-close cabinet hinges, pack of ten.', tags: ['hinge', 'hardware']},
    {name: 'HR Foam Sheet 40 Density', sub: 'Foam & Upholstery', brand: 'Woodcraft Signature', art: 'foam', kind: ProductKind.RAW_MATERIAL, type: 'Foam', material: 'PU Foam', variants: ['6x3 ft x 4 in'], finishes: ['Standard'], mrp: 2400, price: 2200, wholesale: 2000, cost: 1650, gst: 18, hsn: '3921', warranty: 0, unit: 'PCS', specs: [['Density', '40 kg/m³']], desc: 'High-resilience PU foam for sofa seats and cushions.', tags: ['foam', 'raw material']},
    {name: 'Melamine Wood Polish', sub: 'Polish & Finishes', brand: 'Woodcraft Signature', art: 'polish', kind: ProductKind.RAW_MATERIAL, type: 'Polish', material: 'Melamine', variants: ['4 Litre'], finishes: ['Walnut', 'Natural'], mrp: 2600, price: 2400, wholesale: 2200, cost: 1800, gst: 18, hsn: '3208', warranty: 0, unit: 'LTR', specs: [['Coverage', '~12 m² per litre']], desc: 'Melamine polish for a durable satin finish on solid wood.', tags: ['polish', 'raw material']},
];

const seed = async () => {
    if (await prisma.company.findFirst({where: {email: COMPANY_EMAIL, deletedAt: null}})) {
        log('The demo company already exists. To start over run `npx prisma migrate reset`.');
        return;
    }
    const password = await encryptPassword(PASSWORD);

    // ---- Company (admin) with its plan limits, branches with their managers
    const company = await companyService.createCompany(
        companyValidation.createCompanySchema.parse({
            name: 'Woodcraft Interiors', email: COMPANY_EMAIL, contactNumber: '9800000100', postalCode: '411001',
            state: 'Maharashtra', district: 'Pune', city: 'Pune', address: '22, FC Road, Shivajinagar',
            adminName: 'Arjun Mehta', adminEmail: 'admin@demo.furnipro.in', adminPhone: '9800000101', adminPassword: PASSWORD,
            maxBranches: 5, maxEmployees: 40, maxProducts: 1000,
        }),
    );
    const owner = await prisma.user.findFirstOrThrow({where: {companyId: company.id, role: Role.ADMIN}});
    await prisma.user.update({where: {id: owner.id}, data: {mustChangePassword: false}});
    log(`Company ${company.name} · admin login 9800000101`);

    const branchDefs = [
        {key: 'PUNE', name: 'Pune Showroom', city: 'Pune', district: 'Pune', postalCode: '411004', address: '14, Karve Road, Erandwane', phone: '9800000110', manager: 'Rahul Kulkarni', email: 'pune@demo.furnipro.in'},
        {key: 'MUM', name: 'Mumbai Showroom', city: 'Mumbai', district: 'Mumbai Suburban', postalCode: '400050', address: '7, Linking Road, Bandra West', phone: '9800000120', manager: 'Sana Shaikh', email: 'mumbai@demo.furnipro.in'},
    ];
    const branches: Record<string, {id: string; shopId: string; managerId: string}> = {};
    for (const b of branchDefs) {
        const branch = await branchService.create(
            company.id,
            orgValidation.createBranchSchema.parse({
                name: b.name, email: b.email, phone: b.phone, postalCode: b.postalCode, state: 'Maharashtra', district: b.district,
                city: b.city, address: b.address, openingTime: '10:00', closingTime: '21:00', weeklyHolidays: [],
                adminName: b.manager, adminEmail: `manager.${b.key.toLowerCase()}@demo.furnipro.in`, adminPhone: b.phone, adminPassword: PASSWORD,
            }),
            owner.id,
        );
        const outlet = await branchService.outletOf(branch.id);
        await prisma.shop.update({where: {id: outlet.id}, data: {gstin: b.key === 'PUNE' ? '27AABCW1234F1Z5' : '27AABCW1234F2Z4', billPrefix: b.key === 'PUNE' ? 'PUN' : 'MUM'}});
        const manager = await prisma.user.findFirstOrThrow({where: {branchId: branch.id, role: Role.BRANCH_MANAGER}});
        await prisma.user.update({where: {id: manager.id}, data: {mustChangePassword: false}});
        branches[b.key] = {id: branch.id, shopId: outlet.id, managerId: manager.id};
        log(`Branch ${b.name} · manager login ${b.phone}`);
    }
    const scope = (key: string) => ({companyId: company.id, shopId: branches[key].shopId});

    // ---- Staff of each branch
    const staff = [
        {role: 'Sales Executive', dept: 'Sales', perms: ['billing.view', 'billing.edit', 'customers.view', 'customers.edit', 'products.view', 'stock.view', 'pos.bill']},
        {role: 'Accountant', dept: 'Accounts', perms: ['accounts.view', 'accounts.edit', 'reports.view', 'reports.edit', 'billing.view', 'purchase.view', 'customers.view']},
        {role: 'Production Supervisor', dept: 'Manufacturing', perms: ['products.view', 'stock.view', 'stock.edit', 'purchase.view']},
        {role: 'Delivery Executive', dept: 'Delivery', perms: ['orders.view', 'orders.edit']},
    ];
    const names: Record<string, string[]> = {
        PUNE: ['Priya Deshmukh', 'Amit Joshi', 'Suresh Pawar', 'Vikas Shinde'],
        MUM: ['Neha Iyer', 'Farhan Qureshi', 'Ganesh Naik', 'Rohit Yadav'],
    };
    for (const [key, list] of Object.entries(names)) {
        for (const [i, fullname] of list.entries()) {
            const s = staff[i];
            const e = await employeeService.create(
                {companyId: company.id, branchId: branches[key].id, shopId: branches[key].shopId},
                orgValidation.createEmployeeSchema.parse({
                    fullname, phoneNumber: `98000001${key === 'PUNE' ? 3 : 4}${i}`, employeeRole: s.role, jobTitle: s.role, department: s.dept,
                    joiningDate: new Date(Date.now() - (200 + i * 40) * DAY).toISOString().slice(0, 10), permissions: s.perms, password: PASSWORD,
                }),
                owner.id,
            );
            await prisma.user.update({where: {id: e.id}, data: {mustChangePassword: false}});
        }
    }
    log('Staff: 4 per branch (sales, accounts, production, delivery) · logins 980000013x / 980000014x');

    // ---- Categories, subcategories and brands (company-wide)
    const subIds: Record<string, {categoryId: string; id: string}> = {};
    for (const [ci, cat] of CATEGORIES.entries()) {
        const category = await masterService.createCategory(company.id, masterValidation.createCategorySchema.parse({name: cat.name, displayOrder: ci}));
        for (const [si, sub] of cat.subs.entries()) {
            const row = await masterService.createSubcategory(company.id, masterValidation.createSubcategorySchema.parse({name: sub, categoryId: category.id, displayOrder: si}));
            subIds[sub] = {categoryId: category.id, id: row.id};
        }
    }
    const brandIds: Record<string, string> = {};
    for (const name of ['Woodcraft Signature', 'UrbanNest', 'Havenly Home', 'Breeze Electricals', 'ChefPro']) {
        brandIds[name] = (await categoryBrandService.createBrand(company.id, catalogValidation.createBrandSchema.parse({name}))).id;
    }
    log(`${CATEGORIES.length} categories, ${Object.keys(subIds).length} subcategories, ${Object.keys(brandIds).length} brands`);

    // ---- Products with illustrated photos, in each branch that stocks them
    const products: {id: string; branch: string; item: Item}[] = [];
    let photos = 0;
    for (const item of ITEMS) {
        for (const key of ['PUNE', ...(item.mumbai ? ['MUM'] : [])]) {
            const variants = item.variants.flatMap((variantName, vi) =>
                item.finishes.map((finish) => ({
                    variantName,
                    finish,
                    // Smaller configurations cost less
                    ...(vi > 0 ? {mrp: Math.round(item.mrp * 0.78), sellingPrice: Math.round(item.price * 0.78), wholesalePrice: Math.round(item.wholesale * 0.78)} : {}),
                })),
            );
            const p = await shopProductService.create(
                scope(key),
                branches[key].managerId,
                shopProductValidation.createShopProductSchema.parse({
                    name: item.name, detailedDesc: item.desc, shortDesc: item.desc.split('.')[0],
                    categoryId: subIds[item.sub].categoryId, subcategoryId: subIds[item.sub].id, brandId: brandIds[item.brand],
                    productKind: item.kind ?? ProductKind.FINISHED_GOOD, productType: item.type, roomType: item.room, material: item.material,
                    businessLine: lineOf(item), sourcing: sourcingOf(item),
                    finish: item.finishes[0], lengthCm: item.dims?.[0], widthCm: item.dims?.[1], heightCm: item.dims?.[2],
                    specifications: item.specs.map(([k, value]) => ({key: k, value})),
                    assemblyRequired: !!item.assembly, installationAvailable: !!item.install, isCustomizable: !!item.customizable,
                    warrantyMonths: item.warranty, warrantyTerms: item.warranty ? `${item.warranty / 12 >= 1 ? `${item.warranty / 12} year` : `${item.warranty} month`} manufacturer warranty against manufacturing defects.` : undefined,
                    unit: item.unit ?? 'PCS', mrp: item.mrp, sellingPrice: item.price, wholesalePrice: item.wholesale, purchasePrice: item.cost,
                    status: 'PUBLISHED', tags: item.tags, taxRate: item.gst, hsnCode: item.hsn,
                    careInstructions: item.kind ? undefined : 'Wipe with a dry soft cloth. Keep away from direct sunlight and moisture.',
                    variants,
                }),
            );
            // Gallery: one photo per finish, plus a closer view of the first; each variant shows its finish
            let order = 0;
            for (const [fi, finish] of item.finishes.entries()) {
                const files = [await renderArt(PHOTO_DIR, item.art, finish), ...(fi === 0 ? [await renderArt(PHOTO_DIR, item.art, finish, 1)] : [])];
                for (const file of files) {
                    await prisma.productImage.create({data: {productId: p.id, url: photoUrl(file), order, isMain: order === 0, altText: `${item.name} in ${finish}`}});
                    order++;
                    photos++;
                }
                await prisma.productVariant.updateMany({where: {productId: p.id, finish}, data: {image: photoUrl(files[0])}});
            }
            await prisma.product.update({where: {id: p.id}, data: {returnEligible: !item.kind && !item.customizable, returnPeriodDays: 7, weightKg: item.dims ? Math.round(item.dims[0] / 4) : null}});
            products.push({id: p.id, branch: key, item});
        }
    }
    log(`${products.length} products in 2 branches, ${photos} photos`);

    // ---- Suppliers and purchase bills (stock in)
    const supplierDefs = [
        {name: 'Kerala Timber Traders', phone: '9800000301', gstin: '32AAACK1111A1Z1', city: 'Kochi', state: 'Kerala', subs: ['Dining Sets', 'Beds', 'Sideboards', 'Coffee Tables', 'Dining Chairs', 'Plywood & Boards', 'Polish & Finishes']},
        {name: 'Jodhpur Handicraft Works', phone: '9800000302', gstin: '08AAACJ2222B1Z2', city: 'Jodhpur', state: 'Rajasthan', subs: ['Sofas', 'Armchairs', 'Wardrobes', 'TV Units', 'Bookshelves', 'Study Desks', 'Foam & Upholstery', 'Hardware']},
        {name: 'Mumbai Electricals & Home', phone: '9800000303', gstin: '27AAACM3333C1Z3', city: 'Mumbai', state: 'Maharashtra', subs: ['Ceiling Fans', 'Lighting', 'Cookware', 'Utensils', 'Dinnerware', 'Modular Kitchen', 'Office Chairs']},
    ];
    const variantsOf = (productId: string) =>
        prisma.productVariant.findMany({where: {productId, isActive: true}, select: {id: true, variantName: true, finish: true}, orderBy: {createdAt: 'asc'}});
    for (const key of ['PUNE', 'MUM']) {
        for (const [si, sup] of supplierDefs.entries()) {
            await prisma.supplier.create({
                data: {name: sup.name, phone: sup.phone, gstin: sup.gstin, city: sup.city, state: sup.state, contactPerson: 'Sales Desk', paymentTerms: 'Net 30', companyId: company.id, branchId: branches[key].id, shopId: branches[key].shopId},
            });
            const lines = [];
            for (const prod of products.filter((p) => p.branch === key && sup.subs.includes(p.item.sub))) {
                for (const [vi, v] of (await variantsOf(prod.id)).entries()) {
                    // The first variant of a few products stays low to show the low-stock alerts
                    const quantity = prod.item.kind ? 40 : vi === 0 && prod.item.mrp > 30000 ? 2 : 6 + ((vi * 3) % 5);
                    lines.push({variantId: v.id, quantity, unitCost: prod.item.cost, taxRate: prod.item.gst});
                }
            }
            if (!lines.length) continue;
            const bill = await billService.createPurchase(
                scope(key),
                branches[key].managerId,
                billValidation.createPurchaseBillSchema.parse({
                    supplierName: sup.name, supplierPhone: sup.phone, supplierInvoiceNo: `${sup.name.slice(0, 3).toUpperCase()}-${2101 + si}`,
                    items: lines, amountPaid: si === 1 ? 0 : undefined, paymentMode: 'UPI',
                    billDate: new Date(Date.now() - (50 - si) * DAY).toISOString(),
                }),
            );
            await prisma.purchaseBill.update({where: {id: bill.id}, data: {createdAt: new Date(Date.now() - (50 - si) * DAY)}});
            log(`${key} purchase ${bill.billNumber} from ${sup.name}: ${lines.length} lines, ₹${bill.totalAmount.toLocaleString('en-IN')}`);
        }
    }

    // ---- Racks: showroom floor for finished goods, godown racks for raw material
    for (const key of ['PUNE', 'MUM']) {
        const rows = await prisma.inventory.findMany({
            where: {branchId: branches[key].id},
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
    }

    // ---- Manufacturing (Pune workshop): bill of materials, work orders, deliveries
    const pune = scope('PUNE');
    const punePid = (name: string) => products.find((p) => p.branch === 'PUNE' && p.item.name === name)!.id;
    const puneVariant = async (name: string) => (await variantsOf(punePid(name)))[0];
    const raw = {
        ply: await puneVariant('BWP Marine Plywood 18mm'),
        hinge: await puneVariant('Soft-Close Hinge Pack'),
        foam: await puneVariant('HR Foam Sheet 40 Density'),
        polish: await puneVariant('Melamine Wood Polish'),
    };
    const boms: Record<string, {v: {id: string}; q: number; w?: number}[]> = {
        'Aspen 3-Seater Fabric Sofa': [{v: raw.ply, q: 1.5, w: 10}, {v: raw.foam, q: 3, w: 5}, {v: raw.polish, q: 0.5}],
        'Regal Sheesham King Bed': [{v: raw.ply, q: 3, w: 10}, {v: raw.polish, q: 1}],
        'Vista 3-Door Wardrobe': [{v: raw.ply, q: 4, w: 12}, {v: raw.hinge, q: 1}, {v: raw.polish, q: 1}],
        'Heritage 6-Seater Dining Set': [{v: raw.ply, q: 2, w: 10}, {v: raw.foam, q: 1}, {v: raw.polish, q: 1.5}],
        'Classic Buffet Sideboard': [{v: raw.ply, q: 2, w: 10}, {v: raw.hinge, q: 1}, {v: raw.polish, q: 1}],
    };
    for (const [name, lines] of Object.entries(boms)) {
        await manufacturingService.setBom(pune, punePid(name), lines.map((l) => ({materialVariantId: l.v.id, quantity: l.q, wastagePct: l.w ?? 0})));
    }
    const mgr = {id: branches.PUNE.managerId, fullname: 'Rahul Kulkarni'};
    const team = await prisma.user.findMany({where: {branchId: branches.PUNE.id, role: 'EMPLOYEE'}, select: {id: true}});
    const runStages = async (id: string, count: number) => {
        const wo = await manufacturingService.get(pune, id);
        for (const st of wo.stages.slice(0, count)) await manufacturingService.setStage(pune, mgr, id, st.key, true);
    };
    const day = (n: number) => new Date(Date.now() + n * DAY);

    // 1. Made to stock, finished: 4 sofas into stock on rack SR-A2
    const sofaVar = await puneVariant('Aspen 3-Seater Fabric Sofa');
    const wo1 = await manufacturingService.create(pune, mgr.id, manufacturingValidation.createWorkOrderSchema.parse({
        type: 'MADE_TO_STOCK', productId: punePid('Aspen 3-Seater Fabric Sofa'), variantId: sofaVar.id, title: 'Aspen 3-Seater Fabric Sofa', quantity: 4,
        startDate: day(-12).toISOString(), dueDate: day(-2).toISOString(), assignedToId: team[0]?.id, labourCost: 14000, overheadCost: 3000,
    }));
    await manufacturingService.issue(pune, mgr.id, wo1.id);
    await runStages(wo1.id, 6);
    await manufacturingService.qc(pune, wo1.id, true, 'Stitching and polish checked');
    await manufacturingService.complete(pune, mgr.id, wo1.id, 'SR-A2');

    // 2. Made to stock, in progress: 2 king beds, half way
    const bedVar = await puneVariant('Regal Sheesham King Bed');
    const wo2 = await manufacturingService.create(pune, mgr.id, manufacturingValidation.createWorkOrderSchema.parse({
        type: 'MADE_TO_STOCK', productId: punePid('Regal Sheesham King Bed'), variantId: bedVar.id, title: 'Regal Sheesham King Bed', quantity: 2,
        priority: 'HIGH', startDate: day(-4).toISOString(), dueDate: day(5).toISOString(), assignedToId: team[1]?.id ?? team[0]?.id, labourCost: 9000,
    }));
    await manufacturingService.issue(pune, mgr.id, wo2.id);
    await runStages(wo2.id, 3);

    // 3. Made to order, just booked: a custom bed with storage, design photo from the customer
    const bedPhoto = photoUrl(await renderArt(PHOTO_DIR, 'bed', 'Walnut'));
    await manufacturingService.create(pune, mgr.id, manufacturingValidation.createWorkOrderSchema.parse({
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

    // 4. Made to order, finished and out for delivery: a custom wardrobe
    const wo4 = await manufacturingService.create(pune, mgr.id, manufacturingValidation.createWorkOrderSchema.parse({
        type: 'MADE_TO_ORDER', title: 'Custom 4-door sliding wardrobe', quantity: 1,
        customerName: 'Amit Deshpande', customerPhone: '9822003311', customerAddress: '12, Kalpataru Society, Kothrud, Pune 411038',
        category: 'Wardrobes', productType: 'Wardrobe', lengthCm: 240, widthCm: 60, heightCm: 210, sizeNote: '8 ft wide, ceiling height',
        material: 'BWP Plywood', finish: 'Oak laminate', accessories: [{name: 'Mirror on one shutter', quantity: 1, price: 3500}],
        materials: [{variantId: raw.ply.id, plannedQty: 6}, {variantId: raw.hinge.id, plannedQty: 2}, {variantId: raw.polish.id, plannedQty: 1}],
        startDate: day(-15).toISOString(), dueDate: day(1).toISOString(), labourCost: 15000, overheadCost: 3000, quotedPrice: 78000, advancePaid: 40000,
    }));
    await manufacturingService.issue(pune, mgr.id, wo4.id);
    await runStages(wo4.id, 6);
    await manufacturingService.qc(pune, wo4.id, true, 'Shutters aligned, soft-close OK');
    await manufacturingService.complete(pune, mgr.id, wo4.id);
    const driver = team.at(-1)?.id;
    await deliveryService.create(pune, mgr.id, manufacturingValidation.createDeliverySchema.parse({
        workOrderId: wo4.id, customerName: 'Amit Deshpande', customerPhone: '9822003311', address: '12, Kalpataru Society, Kothrud', city: 'Pune', postalCode: '411038',
        items: [{name: 'Custom 4-door sliding wardrobe', quantity: 1}], scheduledDate: day(1).toISOString(), slot: 'MORNING', installation: true, assignedToId: driver,
        notes: 'Third floor, lift available. Carry installation kit.',
    }));
    log('Manufacturing: 5 bills of materials, 4 work orders (1 to stock, 1 in progress, 2 made to order), 1 delivery');

    // ---- Counter sales over the last six weeks (retail and wholesale, cash / UPI / card / credit)
    const finished = products.filter((p) => !p.item.kind);
    const methods = ['CASH', 'UPI', 'CARD', 'UPI', 'CASH', 'CREDIT'] as const;
    const buyers = [
        {name: 'Ananya Rao', phone: '9800000401'}, {name: 'Deepak Gupta', phone: '9800000402'}, {name: 'Shah Interiors', phone: '9800000403', wholesale: true},
        {name: 'Meena Kapoor', phone: '9800000404'}, {name: 'Homestyle Dealers', phone: '9800000405', wholesale: true}, {name: 'Karan Malhotra', phone: '9800000406'},
    ];
    // Bills are credited to the branch's sales staff (salesperson performance)
    const sellers: Record<string, string[]> = {};
    for (const key of ['PUNE', 'MUM']) {
        sellers[key] = [
            branches[key].managerId,
            ...(await prisma.user.findMany({where: {branchId: branches[key].id, employeeRole: 'Sales Executive'}, select: {id: true}})).map((u) => u.id),
        ];
    }
    let saleCount = 0;
    for (let day = 42; day >= 1; day -= 1) {
        for (const key of ['PUNE', 'MUM']) {
            // 0-2 bills a day, busier on weekends
            const date = new Date(Date.now() - day * DAY);
            const count = (day * 7 + (key === 'PUNE' ? 3 : 1)) % (date.getDay() === 0 || date.getDay() === 6 ? 3 : 2);
            for (let n = 0; n < count; n++) {
                const pool = finished.filter((p) => p.branch === key);
                const prod = pool[(day * 5 + n * 11 + (key === 'PUNE' ? 0 : 3)) % pool.length];
                const v = (await variantsOf(prod.id))[(day + n) % 2];
                if (!v) continue;
                const stock = await prisma.inventory.findFirst({where: {variantId: v.id, branchId: branches[key].id}, select: {physicalQty: true, reservedQty: true}});
                if (!stock || stock.physicalQty - stock.reservedQty < 1) continue;
                const buyer = buyers[(day + n) % buyers.length];
                const method = buyer.wholesale ? 'CREDIT' : methods[(day + n) % methods.length];
                const unitPrice = Math.round((buyer.wholesale ? prod.item.wholesale : prod.item.price) * ((day + n) % 2 && prod.item.variants.length > 1 ? 0.78 : 1));
                try {
                    const bill = await billService.createSales(
                        scope(key),
                        branches[key].managerId,
                        billValidation.createSalesBillSchema.parse({
                            saleType: buyer.wholesale ? 'WHOLESALE' : 'RETAIL', paymentMethod: method,
                            customerName: buyer.name, customerPhone: buyer.phone,
                            paidAmount: method === 'CREDIT' ? Math.round(unitPrice * 0.3) : undefined,
                            billType: buyer.wholesale ? 'TAX_INVOICE_B2B' : 'TAX_INVOICE_B2C',
                            customerGstin: buyer.wholesale ? '27AAAFH4444D1Z6' : undefined,
                            salesmanId: sellers[key][(day + n) % sellers[key].length],
                            items: [{variantId: v.id, quantity: 1, unitPrice, discount: 0}],
                        }),
                    );
                    const at = new Date(date.getTime() + (11 + n * 3) * 3_600_000);
                    await prisma.salesBill.update({where: {id: bill.id}, data: {billDate: at, createdAt: at}});
                    await prisma.salesBillPayment.updateMany({where: {billId: bill.id}, data: {paidAt: at}});
                    saleCount++;
                } catch (e) {
                    // A credit limit or stock check may refuse a bill; the demo simply skips it
                    void e;
                }
            }
        }
    }
    log(`${saleCount} counter sales over the last six weeks`);

    // ---- Quotations
    const sofa = products.find((p) => p.branch === 'PUNE' && p.item.art === 'sofa')!;
    const bed = products.find((p) => p.branch === 'PUNE' && p.item.art === 'bed')!;
    const kitchen = products.find((p) => p.branch === 'PUNE' && p.item.art === 'kitchenCabinet')!;
    const firstVariant = async (id: string) => (await variantsOf(id))[0];
    const quotes = [
        {customerName: 'Ritu Sharma', customerPhone: '9800000501', lines: [{p: sofa, qty: 1}, {p: bed, qty: 1}], status: 'SENT', extra: 1500},
        {customerName: 'Shah Interiors', customerPhone: '9800000403', saleType: 'WHOLESALE', customerGstin: '27AAAFH4444D1Z6', lines: [{p: sofa, qty: 4}], status: 'ACCEPTED', extra: 0},
        {customerName: 'Vivek Patil', customerPhone: '9800000502', lines: [{p: kitchen, qty: 14}], custom: {description: 'Overhead wall cabinets, 10 ft, acrylic gloss shutters', qty: 1, price: 38000}, status: 'DRAFT', extra: 2500},
    ];
    for (const q of quotes) {
        const items = [];
        for (const l of q.lines) {
            const v = await firstVariant(l.p.id);
            const price = q.saleType === 'WHOLESALE' ? l.p.item.wholesale : l.p.item.price;
            // Quotes are written before GST: take it out of the GST-inclusive tag price
            items.push({productId: l.p.id, variantId: v.id, description: `${l.p.item.name} · ${v.variantName} / ${v.finish}`, quantity: l.qty, unitPrice: Math.round(price / (1 + l.p.item.gst / 100)), taxRate: l.p.item.gst, hsnCode: l.p.item.hsn});
        }
        if (q.custom) items.push({description: q.custom.description, quantity: q.custom.qty, unitPrice: q.custom.price, taxRate: 18});
        const created = await quotationService.create(
            scope('PUNE'),
            branches.PUNE.managerId,
            quotationValidation.createQuotationSchema.parse({
                customerName: q.customerName, customerPhone: q.customerPhone, saleType: q.saleType ?? 'RETAIL', customerGstin: q.customerGstin,
                validUntil: new Date(Date.now() + 15 * DAY).toISOString(), extraCharges: q.extra,
                terms: '50% advance with order, balance before delivery. Prices valid for 15 days. Free installation within city limits.',
                items,
            }),
        );
        if (q.status !== 'DRAFT') await quotationService.setStatus(scope('PUNE'), created.id, q.status as 'SENT' | 'ACCEPTED');
    }
    log(`${quotes.length} quotations (draft, sent, accepted)`);

    // ---- Coupons shown on the store
    const in60 = new Date(Date.now() + 60 * DAY);
    const coupons = [
        {code: 'HOME10', name: '10% off', description: 'Extra 10% off on furniture, up to ₹5,000', type: 'PERCENTAGE' as const, discountValue: 10, maxDiscountLimit: 5000, minPurchaseAmount: 9999},
        {code: 'WELCOME1000', name: '₹1,000 off', description: '₹1,000 off your first order above ₹15,000', type: 'FLAT' as const, discountValue: 1000, minPurchaseAmount: 15000},
        {code: 'FESTIVE15', name: 'Festive 15% off', description: 'Festive sale · max ₹7,500', type: 'PERCENTAGE' as const, discountValue: 15, maxDiscountLimit: 7500, minPurchaseAmount: 25000},
    ];
    for (const c of coupons) {
        await prisma.coupon.upsert({
            where: {code: c.code},
            create: {...c, startDate: new Date(), endDate: in60, companyId: company.id, perCustomerLimit: 3},
            update: {isActive: true, endDate: in60, companyId: company.id, usedCount: 0},
        });
    }
    log(`Coupons: ${coupons.map((c) => c.code).join(', ')}`);

    // ---- Store customers, online orders and reviews
    const customers = [
        {fullname: 'Kavya Nair', email: 'kavya@demo.furnipro.in', phone: '9800000200', addr: {address1: 'Flat 802, Lake View Towers', address2: 'Baner Road', city: 'Pune', district: 'Pune', postalCode: '411045'}},
        {fullname: 'Rohan Verma', email: 'rohan@demo.furnipro.in', phone: '9800000201', addr: {address1: '12, Sea Breeze Apartments', address2: 'Carter Road, Bandra', city: 'Mumbai', district: 'Mumbai Suburban', postalCode: '400050'}},
        {fullname: 'Sneha Kulkarni', email: 'sneha@demo.furnipro.in', phone: '9800000202', addr: {address1: '5, Shanti Niketan', address2: 'Kothrud', city: 'Pune', district: 'Pune', postalCode: '411038'}},
    ];
    const people: Record<string, {id: string; homeId: string}> = {};
    for (const c of customers) {
        const u = await prisma.user.create({
            data: {fullname: c.fullname, email: c.email, phoneNumber: c.phone, username: c.phone, password, role: Role.USER, isVerified: true, status: AccountStatus.ACTIVE},
        });
        const home = await customerService.saveAddress(u.id, {recipient: c.fullname, phone: c.phone, ...c.addr, state: 'Maharashtra', label: 'HOME', isDefault: true, country: 'India'} as never);
        people[c.phone] = {id: u.id, homeId: home.id};
    }
    const variantFor = async (name: string, branch: string) => {
        const p = products.find((x) => x.item.name === name && x.branch === branch);
        if (!p) throw new Error(`Unknown demo product ${name}`);
        // A variant the branch still has in stock (counter sales may have sold the first one)
        for (const v of await variantsOf(p.id)) {
            const inv = await prisma.inventory.findFirst({where: {variantId: v.id}, select: {physicalQty: true, reservedQty: true}});
            if (inv && inv.physicalQty - inv.reservedQty > 0) return {...p, variantId: v.id};
        }
        throw new Error(`${name} is out of stock in ${branch}`);
    };
    const place = async (phone: string, lines: {name: string; branch: string}[], coupon?: string) => {
        const who = people[phone];
        await prisma.cartItem.deleteMany({where: {cart: {userId: who.id}}});
        for (const l of lines) await customerService.addToCart(who.id, {variantId: (await variantFor(l.name, l.branch)).variantId, quantity: 1});
        const placed = await checkoutService.checkout(who.id, {addressId: who.homeId, delivery: 'STANDARD', paymentMethod: 'COD', couponCode: coupon});
        return prisma.order.findMany({where: {id: {in: placed.orders.map((o) => o.id)}}, select: {id: true, orderNumber: true, shopId: true}});
    };
    const keyOfShop = (shopId: string | null) => Object.keys(branches).find((k) => branches[k].shopId === shopId)!;
    const move = async (o: {id: string; shopId: string | null}, to: OrderStatus) => {
        const key = keyOfShop(o.shopId);
        const path: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
        for (const step of path.slice(0, path.indexOf(to) + 1)) {
            if (step === OrderStatus.SHIPPED) {
                await orderService.updateShipping(scope(key), o.id, {courierName: 'Woodcraft Delivery Van', trackingNumber: `WD${o.id.replace(/\D/g, '').slice(0, 8).padEnd(8, '4')}`}, branches[key].managerId);
            } else {
                await orderService.updateStatus(scope(key), o.id, {status: step, comment: step === OrderStatus.PACKED ? 'Quality checked and packed' : step === OrderStatus.DELIVERED ? 'Delivered and installed' : undefined}, branches[key].managerId);
            }
        }
    };
    const backdate = async (orderId: string, days: number) => {
        const at = new Date(Date.now() - days * DAY);
        await prisma.order.update({where: {id: orderId}, data: {createdAt: at}});
        await prisma.orderStatusHistory.updateMany({where: {orderId}, data: {createdAt: at}});
    };
    const stories: {phone: string; lines: {name: string; branch: string}[]; to: OrderStatus | null; days: number; reviews?: {name: string; rating: number; title: string; comment: string}[]; coupon?: string}[] = [
        {phone: '9800000201', lines: [{name: 'Aspen 3-Seater Fabric Sofa', branch: 'MUM'}], to: OrderStatus.DELIVERED, days: 25, reviews: [{name: 'Aspen 3-Seater Fabric Sofa', rating: 5, title: 'Super comfortable', comment: 'Deep seats and the fabric feels premium. Delivery team set it up in ten minutes.'}]},
        {phone: '9800000202', lines: [{name: 'Regal Sheesham King Bed', branch: 'PUNE'}, {name: 'Breeze 1200mm BLDC Ceiling Fan', branch: 'PUNE'}], to: OrderStatus.DELIVERED, days: 18, reviews: [
            {name: 'Regal Sheesham King Bed', rating: 5, title: 'Solid and sturdy', comment: 'Real sheesham, heavy and well finished. The hydraulic storage is very handy.'},
            {name: 'Breeze 1200mm BLDC Ceiling Fan', rating: 4, title: 'Silent and saves power', comment: 'Very quiet at night. Remote range could be better.'},
        ]},
        {phone: '9800000200', lines: [{name: 'Heritage 6-Seater Dining Set', branch: 'PUNE'}], to: OrderStatus.DELIVERED, days: 12, coupon: 'HOME10', reviews: [{name: 'Heritage 6-Seater Dining Set', rating: 5, title: 'Beautiful teak finish', comment: 'Looks even better than the photos. Chairs are comfortable for long dinners.'}]},
        {phone: '9800000200', lines: [{name: 'ErgoPro Mesh Office Chair', branch: 'PUNE'}], to: OrderStatus.SHIPPED, days: 2},
        {phone: '9800000200', lines: [{name: 'Orbit Round Coffee Table', branch: 'PUNE'}], to: null, days: 0.1},
        {phone: '9800000201', lines: [{name: 'Linea Wall TV Unit', branch: 'MUM'}], to: OrderStatus.CONFIRMED, days: 1},
    ];
    for (const s of stories) {
        const orders = await place(s.phone, s.lines, s.coupon);
        for (const o of orders) {
            if (s.to) await move(o, s.to);
            await backdate(o.id, s.days);
        }
        for (const r of s.reviews ?? []) {
            const p = products.find((x) => x.item.name === r.name)!;
            const branchProduct = products.find((x) => x.item.name === r.name && s.lines.some((l) => l.name === r.name && l.branch === x.branch)) ?? p;
            await customerService.review(people[s.phone].id, branchProduct.id, {rating: r.rating, title: r.title, comment: r.comment, images: []});
        }
    }
    // Something in the bag and wishlist for the main demo customer
    const kavya = people['9800000200'];
    await customerService.addToCart(kavya.id, {variantId: (await variantFor('Vista 3-Door Wardrobe', 'PUNE')).variantId, quantity: 1});
    for (const name of ['Milano L-Shape Sectional Sofa', 'Oslo Wingback Armchair', 'Dome Pendant Light']) {
        await customerService.addToWishlist(kavya.id, products.find((p) => p.item.name === name && p.branch === 'PUNE')!.id);
    }
    log(`${customers.length} store customers, ${stories.length} online orders · customer login 9800000200`);
};

const main = async () => {
    // Demo logins share a published password
    if (config.env === 'production') {
        throw new Error('Refusing to create demo data with NODE_ENV=production (its logins use a known password).');
    }
    console.log('Creating furniture demo data…');
    await seed();
    console.log(`Done. All demo logins use the password ${PASSWORD}`);
};

main()
    .catch((e) => {
        console.error('Demo seed failed:', e?.message ?? e, e?.errors ? JSON.stringify(e.errors) : '');
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
