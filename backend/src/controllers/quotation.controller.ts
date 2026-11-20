import httpStatus from 'http-status';
import {auditService} from '@services/index';
import quotationService from '../services/quotation.service';
import {catchAsync} from '@utils/index';
import v from '../validations/quotation.validation';
import {ok, shopOf} from './scope';

/* Quotations of the signed-in user's branch */

const list = catchAsync(async (req, res) => {
    const query = v.listSchema.parse(req.query);
    return ok(res, await quotationService.list(shopOf(req), query), 'Quotations fetched successfully');
});

const get = catchAsync(async (req, res) => {
    const {id} = v.idSchema.parse(req.params);
    return ok(res, await quotationService.get(shopOf(req), id), 'Quotation fetched successfully');
});

const create = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const data = v.createQuotationSchema.parse(req.body);
    const {after} = await auditService.track(req, {action: 'quotation.create', module: 'billing'}, async () => ({
        after: await quotationService.create(scope, req.user.id, data),
    }));
    return ok(res, after, `Quotation ${after.quotationNumber} created`, httpStatus.CREATED);
});

const update = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const data = v.updateQuotationSchema.parse(req.body);
    const {after} = await auditService.track(
        req,
        {action: 'quotation.update', module: 'billing', targetId: id},
        () => quotationService.update(scope, id, data),
    );
    return ok(res, after, 'Quotation updated');
});

const setStatus = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    const {status} = v.statusSchema.parse(req.body);
    const {after} = await auditService.track(
        req,
        {action: `quotation.${status.toLowerCase()}`, module: 'billing', targetId: id},
        () => quotationService.setStatus(scope, id, status),
    );
    return ok(res, after, `Quotation marked ${status.toLowerCase()}`);
});

const remove = catchAsync(async (req, res) => {
    const scope = shopOf(req);
    const {id} = v.idSchema.parse(req.params);
    await auditService.track(req, {action: 'quotation.delete', module: 'billing', targetId: id}, () =>
        quotationService.delete(scope, id),
    );
    return ok(res, {}, 'Quotation deleted');
});

const billDraft = catchAsync(async (req, res) => {
    const {id} = v.idSchema.parse(req.params);
    return ok(res, await quotationService.billDraft(shopOf(req), id), 'Ready to bill');
});

export default {list, get, create, update, setStatus, remove, billDraft};
