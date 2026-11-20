import {Router} from 'express';
import {
    orgController,
    ecommerceController,
    masterController,
    shopProductController as p,
    companySettingsController,
    stockTransferController,
    analyticsController,
} from '@controllers/index';
import {checkCompanyAdmin, verifyJWT} from '@middlewares/index';
import {limitService} from '@services/index';
import {ApiResponse, catchAsync} from '@utils/index';
import mountCatalog from './catalog.routes';
import {mountPromotions} from './promotion.routes';

const c = orgController;
const e = ecommerceController;
const router = Router();

// Everything here is scoped to the signed-in admin's company
router.use(verifyJWT, checkCompanyAdmin);

router.get('/dashboard', c.scopedDashboard);
router.get('/analytics', analyticsController.summary);
router.get('/profile', c.companyProfile);
// Plan limits set by the super admin, with what is in use
router.get(
    '/limits',
    catchAsync(async (req, res) =>
        res.json(new ApiResponse(200, await limitService.summary(req.user.companyId!), 'Plan limits')),
    ),
);
router.post('/branch-mode', c.switchToBranchMode);
// Business rules: refund limit, discount flag, low stock, credit days, margin (P4-08)
router.route('/settings').get(companySettingsController.get).patch(companySettingsController.update);

// Branches
router.get('/branches/options', c.branchOptions);
router.route('/branches').get(c.listBranches).post(c.createBranch);
router.route('/branches/:id').get(c.getBranch).patch(c.updateBranch);
router.patch('/branches/:id/status', c.setBranchStatus);

// Branch outlets (one per branch, made with the branch): pickers and stats only
router.get('/shops/options', c.shopOptions);
router.get('/shops/stats', c.shopStats);
router.get('/shops', c.listShops);

// Employees
router.route('/employees').get(c.listEmployees).post(c.createEmployee);
router.route('/employees/:id').get(c.getEmployee).patch(c.updateEmployee);

// Users status & session management
router.patch('/users/:id/status', c.setUserStatus);
router.post('/users/:id/revoke-sessions', c.revokeSessions);

// Catalog: own brands and all of the company's products
mountCatalog(router, {manageBrands: true, manageProducts: true});
// Sub-categories for the offer form (read only; edited in the shop panel)
router.get('/subcategories', masterController.listSubcategories);

// Stock transfers between branches: head office approves and picks the sending branch
const tr = stockTransferController.branch;
router.get('/transfers', tr.list);
router.get('/transfers/summary', tr.summary);
router.get('/transfers/:id', tr.get);
router.get('/transfers/:id/sources', tr.sources);
router.post('/transfers/:id/decision', tr.decide);

// Inventory
router.get('/inventory/dashboard', e.inventoryDashboard);
router.get('/inventory', e.listInventory);
router.post('/inventory/adjust', e.adjustStock);
router.post('/inventory/batch-adjust', e.batchAdjustStock);
router.patch('/inventory/threshold', e.updateThreshold);
router.get('/inventory/movements', e.listMovements);

// Orders & Returns: view only; the selling branch changes them
router.get('/orders/dashboard', e.orderDashboard);
router.route('/orders').get(e.listOrders);
router.route('/orders/:id').get(e.getOrder);
router.get('/orders/:id/invoice', e.getOrderInvoice);

router.get('/returns', e.listReturns);

// Promotions & Offers
mountPromotions(router);

export default router;
