import httpStatus from 'http-status';
import {auditService} from '@services/index';
import manufacturingService from '../services/manufacturing.service';
import deliveryService from '../services/delivery.service';
import {catchAsync} from '@utils/index';
import v from '../validations/manufacturing.validation';
import {ok, shopOf} from './scope';

/* Work orders, bill of materials, racks and deliveries of the signed-in user's branch */

const track = <T>(req: Parameters<typeof auditService.track>[0], action: string, targetId: string | undefined, run: () => Promise<T>) =>
    auditService.track(req, {action, module: action.startsWith('delivery') ? 'delivery' : 'manufacturing', targetId}, async () => ({after: await run()}));

/* Work orders --------------------------------------------------------------- */

const list = catchAsync(async (req, res) => ok(res, await manufacturingService.list(shopOf(req), v.listWorkOrdersSchema.parse(req.query)), 'Work orders fetched'));

const options = catchAsync(async (req, res) => ok(res, await manufacturingService.options(shopOf(req)), 'Options fetched'));

const get = catchAsync(async (req, res) => {
    const {id} = v.idSchema.parse(req.params);
    return ok(res, await manufacturingService.get(shopOf(req), id), 'Work order fetched');
});

const create = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const data = v.createWorkOrderSchema.parse(req.body);
    const {after} = await track(req, 'workorder.create', undefined, () => manufacturingService.create(scope, req.user.id, data));
    return ok(res, after, `Work order ${after.woNumber} created`, httpStatus.CREATED);
});

const update = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const data = v.updateWorkOrderSchema.parse(req.body);
    const {after} = await track(req, 'workorder.update', id, () => manufacturingService.update(scope, id, data));
    return ok(res, after, 'Work order updated');
});

const issue = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {lines} = v.issueSchema.parse(req.body ?? {});
    const {after} = await track(req, 'workorder.issue', id, () => manufacturingService.issue(scope, req.user.id, id, lines));
    return ok(res, after, 'Raw material issued from stock');
});

const returnMaterial = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {lines} = v.returnSchema.parse(req.body);
    const {after} = await track(req, 'workorder.return', id, () => manufacturingService.returnMaterial(scope, req.user.id, id, lines));
    return ok(res, after, 'Material returned to stock');
});

const stage = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {key, done} = v.stageSchema.parse(req.body);
    const {after} = await track(req, 'workorder.stage', id, () =>
        manufacturingService.setStage(scope, {id: req.user.id, fullname: (req.user as {fullname?: string}).fullname}, id, key, done),
    );
    return ok(res, after, done ? 'Stage done' : 'Stage reopened');
});

const qc = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {passed, notes} = v.qcSchema.parse(req.body);
    const {after} = await track(req, 'workorder.qc', id, () => manufacturingService.qc(scope, id, passed, notes));
    return ok(res, after, passed ? 'Quality check passed' : 'Sent back for rework');
});

const complete = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {rackNo} = v.completeSchema.parse(req.body ?? {});
    const {after} = await track(req, 'workorder.complete', id, () => manufacturingService.complete(scope, req.user.id, id, rackNo));
    return ok(res, after, after.type === 'MADE_TO_STOCK' ? `${after.quantity} added to stock` : 'Completed: schedule the delivery');
});

const cancel = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {reason} = v.cancelSchema.parse(req.body);
    const {after} = await track(req, 'workorder.cancel', id, () => manufacturingService.cancel(scope, req.user.id, id, reason));
    return ok(res, after, 'Work order cancelled');
});

/* Bill of materials / racks -------------------------------------------------- */

const getBom = catchAsync(async (req, res) => {
    const {id} = v.idSchema.parse(req.params);
    return ok(res, await manufacturingService.getBom(shopOf(req), id), 'Bill of materials fetched');
});

const setBom = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {lines} = v.bomSchema.parse(req.body);
    const {after} = await track(req, 'bom.update', id, () => manufacturingService.setBom(scope, id, lines));
    return ok(res, after, 'Bill of materials saved');
});

const setRack = catchAsync(async (req, res) => {
    const {variantId} = v.variantIdSchema.parse(req.params);
    const {rackNo} = v.rackSchema.parse(req.body);
    return ok(res, await manufacturingService.setRack(shopOf(req), variantId, rackNo), 'Rack saved');
});

/* Deliveries ------------------------------------------------------------------ */

const listDeliveries = catchAsync(async (req, res) => ok(res, await deliveryService.list(shopOf(req), v.listDeliveriesSchema.parse(req.query)), 'Deliveries fetched'));

const deliveryTeam = catchAsync(async (req, res) => ok(res, await deliveryService.team(shopOf(req)), 'Team fetched'));

const getDelivery = catchAsync(async (req, res) => {
    const {id} = v.idSchema.parse(req.params);
    return ok(res, await deliveryService.get(shopOf(req), id), 'Delivery fetched');
});

const createDelivery = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const data = v.createDeliverySchema.parse(req.body);
    const {after} = await track(req, 'delivery.create', undefined, () => deliveryService.create(scope, req.user.id, data));
    return ok(res, after, `Delivery ${after.deliveryNumber} scheduled`, httpStatus.CREATED);
});

const assignDelivery = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const data = v.assignSchema.parse(req.body);
    const {after} = await track(req, 'delivery.assign', id, () => deliveryService.assign(scope, id, data));
    return ok(res, after, 'Delivery updated');
});

const deliveryStatus = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const data = v.deliveryStatusSchema.parse(req.body);
    const {after} = await track(req, `delivery.${data.status.toLowerCase()}`, id, () => deliveryService.setStatus(scope, req.user.id, id, data));
    return ok(res, after, `Delivery marked ${data.status.toLowerCase().replace(/_/g, ' ')}`);
});

export default {
    list,
    options,
    get,
    create,
    update,
    issue,
    returnMaterial,
    stage,
    qc,
    complete,
    cancel,
    getBom,
    setBom,
    setRack,
    listDeliveries,
    deliveryTeam,
    getDelivery,
    createDelivery,
    assignDelivery,
    deliveryStatus,
};
