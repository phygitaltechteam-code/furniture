import {Router} from 'express';
import {Role} from '@prisma/client';
import {
    customerController,
    creditController,
    purchaseReturnController,
    supplierController,
    barcodeLabelController,
    stockController,
    stockAdjustmentController,
    ecommerceController as e,
    masterController as m,
    orgController as c,
    shopProductController as p,
    creditNoteController,
    branchReportsController,
    dayCloseController,
    stockTransferController,
    shopGstController,
    companySettingsController,
    quotationController as q,
    manufacturingController as mfg,
    catalogController,
    analyticsController,
} from '@controllers/index';
import {
    checkRole,
    companyAdminShopMode,
    imageUpload,
    ownerOnly,
    verifyJWT,
} from '@middlewares/index';
import {mountPromotions} from './promotion.routes';
import {mountBills} from './bill.routes';
import {mountShopOps} from './shopOps.routes';
import {mountStaffCash} from './staffCash.routes';

/**
 * Every shop route, without sign-in checks. Mounted twice:
 *   /shop-admin  for the shop login (everything)
 *   /employee    for employees, limited per module (see employeeModuleGuard)
 */
const router = Router();

// ---- Employees ----
router.route('/employees').get(c.listEmployees).post(c.createEmployee);
router.route('/employees/:id').get(c.getEmployee).patch(c.updateEmployee);

router.patch('/users/:id/status', c.setUserStatus);
router.post('/users/:id/revoke-sessions', c.revokeSessions);

// ---- 1. Categories and 2. Subcategories: one list for the whole company (D-02),
// so only the owner (company admin in shop mode) changes them; shops and staff read
router.get('/categories/options', m.categoryOptions);
// Brands of the company (and platform-wide ones) for the product form
router.get('/brands/options', catalogController.brandOptions);
// Business analytics of the branch (sales trend, top products, dues…)
router.get('/analytics', analyticsController.summary);
router.route('/categories').get(m.listCategories).post(ownerOnly, m.createCategory);
router
    .route('/categories/:id')
    .get(m.getCategory)
    .patch(ownerOnly, m.updateCategory)
    .delete(ownerOnly, m.deleteCategory);
router.route('/subcategories').get(m.listSubcategories).post(ownerOnly, m.createSubcategory);
router
    .route('/subcategories/:id')
    .get(m.getSubcategory)
    .patch(ownerOnly, m.updateSubcategory)
    .delete(ownerOnly, m.deleteSubcategory);

// ---- 3. Colors and 4. Sizes: each shop's own (D-02) ----

// ---- GST price rule and slabs (D-18): read by the POS and the product form;
// changed only under /shop-admin (see adminRoutes) ----
router.get('/gst-rule', shopGstController.get);
// The company's rules (refund limit, credit days, low stock…), read only (P4-08)
router.get('/settings', companySettingsController.get);

// ---- 5. Products ----
// Create takes form data: the product fields and its photos in one request
router.route('/products').get(p.listProducts).post(imageUpload.array('images', 8), p.createProduct);
router.route('/products/:id').get(p.getProduct).patch(p.updateProduct).delete(p.deleteProduct);
router.post('/products/:id/images', imageUpload.array('images', 8), p.uploadImages);
router.route('/products/:id/images/:imageId').patch(p.updateImage).delete(p.deleteImage);

// ---- 6. Inventory & Stock Adjustments ----
router.get('/inventory/dashboard', e.inventoryDashboard);
router.get('/inventory', e.listInventory);
router.post('/inventory/adjust', e.adjustStock);
router.post('/inventory/batch-adjust', e.batchAdjustStock);
router.patch('/inventory/threshold', e.updateThreshold);
router.get('/inventory/movements', e.listMovements);

// ---- 7. Offers & Promotions Management ----
mountPromotions(router);

// ---- 8. Purchase & Sales Bills (automatic stock in / out) ----
mountBills(router);

// ---- Quotations: priced offers that convert into a sales bill ----
router.route('/quotations').get(q.list).post(q.create);
router.route('/quotations/:id').get(q.get).patch(q.update).delete(q.remove);
router.patch('/quotations/:id/status', q.setStatus);
router.get('/quotations/:id/bill-draft', q.billDraft);

// ---- Manufacturing: work orders (raw material -> stages -> QC -> stock / customer) ----
router.get('/work-orders/options', mfg.options);
router.route('/work-orders').get(mfg.list).post(mfg.create);
router.route('/work-orders/:id').get(mfg.get).patch(mfg.update);
router.post('/work-orders/:id/issue', mfg.issue);
router.post('/work-orders/:id/return', mfg.returnMaterial);
router.post('/work-orders/:id/stage', mfg.stage);
router.post('/work-orders/:id/qc', mfg.qc);
router.post('/work-orders/:id/complete', mfg.complete);
router.post('/work-orders/:id/cancel', mfg.cancel);
// Bill of materials of a finished product
router.route('/bom/:id').get(mfg.getBom).put(mfg.setBom);
// Rack / shelf of an item in this branch
router.patch('/racks/:variantId', mfg.setRack);

// ---- Deliveries & installation ----
router.get('/deliveries/team', mfg.deliveryTeam);
router.route('/deliveries').get(mfg.listDeliveries).post(mfg.createDelivery);
router.get('/deliveries/:id', mfg.getDelivery);
router.patch('/deliveries/:id/assign', mfg.assignDelivery);
router.patch('/deliveries/:id/status', mfg.deliveryStatus);

// ---- Sales returns (credit notes); cash / large refunds wait for the branch admin ----
const cn = creditNoteController.shop;
router.route('/credit-notes').get(cn.list).post(cn.create);
router.get('/credit-notes/returnable', cn.returnable);
router.get('/credit-notes/:id', cn.get);

// ---- Shop Customers ----
router.get('/customers', customerController.list);
router.get('/customers/online', customerController.online);
router.post('/customers', customerController.create);
router.get('/customers/:id', customerController.get);
router.patch('/customers/:id', customerController.update);
router.post('/customers/import', customerController.importExcel);

// ---- Credit / Udhaar ----
router.get('/credit/metrics', creditController.getMetrics);
router.get('/credit/customers', creditController.getCustomersWithDue);
router.get('/credit/customers/:customerId/statement', creditController.getCustomerStatement);
router.get('/credit/next-receipt', creditController.getNextReceiptNumber);
router.post('/credit/customers/:customerId/payment', creditController.recordPayment);
router.get('/credit/reminders', creditController.getWhatsAppReminders);


// ---- Suppliers & Payments ----
router.get('/suppliers', supplierController.listSuppliers);
router.post('/suppliers', supplierController.createSupplier);
router.get('/suppliers/next-receipt', supplierController.getNextReceipt);
router.get('/suppliers/:id/ledger', supplierController.getSupplierLedger);
router.post('/suppliers/payment', supplierController.recordPayment);


// ---- Live Stock Summary & Audit ----
router.get('/stock/summary', stockController.getStockSummary);
router.post('/stock/adjust', stockController.adjustStock);
router.post('/stock/physical-count', stockController.recordPhysicalStockCount);

// ---- Stock Adjustments (Dedicated Page) ----
router.get('/stock-adjustments/next-number', stockAdjustmentController.getNextAdjustmentNumber);
router.get('/stock-adjustments/variants', stockAdjustmentController.getAdjustmentVariants);
router.get('/stock-adjustments', stockAdjustmentController.getAdjustmentHistory);
router.post('/stock-adjustments', stockAdjustmentController.createAdjustment);

// ---- Barcode Labels ----
router.get('/barcode-labels/purchase-bills', barcodeLabelController.getPurchaseBills);
router.get('/barcode-labels/bills/:billId/items', barcodeLabelController.getBillItems);
router.get('/barcode-labels/products', barcodeLabelController.searchProducts);
router.get('/barcode-labels/reprint-batches', barcodeLabelController.getReprintBatches);
router.post('/barcode-labels/print', barcodeLabelController.recordPrintJob);

// ---- Purchase Returns (Debit Notes) ----
router.get('/purchase-returns/next-number', purchaseReturnController.getNextDebitNoteNumber);
router.get('/purchase-returns/suppliers', purchaseReturnController.getSuppliers);
router.get('/purchase-returns/bills', purchaseReturnController.getBillsBySupplier);
router.get('/purchase-returns/earlier', purchaseReturnController.getEarlierReturns);
router.post('/purchase-returns', purchaseReturnController.createPurchaseReturn);
router.get('/purchase-returns/:id', purchaseReturnController.getPurchaseReturn);

// ---- Shop dashboard, credit notes, cash counter, expenses ----
mountShopOps(router);

// Profit & loss of this shop
router.get('/reports/pnl', branchReportsController.getShopPnl);

// ---- Staff & rights, cash book & day close, stock transfer ----
mountStaffCash(router);

// ---- 9. Order Management & Returns ----
router.get('/orders/dashboard', e.orderDashboard);
router.route('/orders').get(e.listOrders);
router.route('/orders/:id').get(e.getOrder);
router.patch('/orders/:id/status', e.updateOrderStatus);
router.patch('/orders/:id/shipping', e.updateOrderShipping);
router.patch('/orders/:id/payment', e.updateOrderPayment);
router.post('/orders/:id/cancel-review', e.reviewCancellation);
router.get('/orders/:id/invoice', e.getOrderInvoice);

router.get('/returns', e.listReturns);
router.patch('/returns/:id', e.updateReturnStatus);

export const shopRoutes = router;

// Only under /shop-admin (not /employee): the company admin in shop mode does
// the branch admin's jobs for the open shop, as there may be no branch admin
const ownerRoutes = Router();
ownerRoutes.post('/credit-notes/:id/decision', ownerOnly, cn.decide);
ownerRoutes.post('/day-close/resolve-difference', ownerOnly, dayCloseController.shopResolve);
// Transfers of the open shop's branch, same handlers as the branch admin's
ownerRoutes.get('/transfers/:id/sources', ownerOnly, stockTransferController.branch.sources);
ownerRoutes.post('/transfers/:id/decision', ownerOnly, stockTransferController.branch.decide);
// Shop settings: the shop login and the owner in shop mode, never employees
ownerRoutes.patch('/gst-rule', shopGstController.update);

// Only the shop login and the company admin in shop mode (D-08): a company admin
// works in one of their shops via X-Shop-Id (companyAdminShopMode). The super
// admin and branch admins use their own panels; employees use /employee.
const shopAdminRouter = Router();
shopAdminRouter.use(
    verifyJWT,
    checkRole([Role.BRANCH_MANAGER, Role.ADMIN]),
    companyAdminShopMode,
    ownerRoutes,
    shopRoutes,
);

export default shopAdminRouter;
