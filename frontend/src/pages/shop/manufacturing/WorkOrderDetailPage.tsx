import {ConfirmDialog} from '@/components/Forms';
import {PageHeader} from '@/components/ui';
import {
  useCancelWorkOrder,
  useCompleteWorkOrder,
  useIssueMaterial,
  useRecordQc,
  useReturnMaterial,
  useSetStage,
  useWorkOrder,
} from '@/lib/react-query/queriesAndMutations/manufacturing';
import {DELIVERY_STATUS, PRIORITY, WO_TYPE_LABEL, WorkOrder, WorkOrderMaterial, WorkOrderStatus} from '@/types/manufacturing';
import {getErrorMessage} from '@/utils/axios';
import {inr} from '@/utils/money';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {
  Ban,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Loader2,
  PackageCheck,
  PackageMinus,
  Pencil,
  Printer,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import {ReactNode, useState} from 'react';
import ScheduleDeliveryDialog from './ScheduleDeliveryDialog';
import {ProgressBar, shortDate, WoStatusPill} from './WorkOrderListPage';

const STEPS: {key: WorkOrderStatus; label: string}[] = [
  {key: 'PLANNED', label: 'Planned'},
  {key: 'MATERIAL_ISSUED', label: 'Material issued'},
  {key: 'IN_PROGRESS', label: 'Production'},
  {key: 'QUALITY_CHECK', label: 'Quality check'},
  {key: 'COMPLETED', label: 'Completed'},
  {key: 'DELIVERED', label: 'Delivered'},
];

const Stepper = ({wo}: {wo: WorkOrder}) => {
  const steps = wo.type === 'MADE_TO_ORDER' ? STEPS : STEPS.slice(0, 5).map((s) => (s.key === 'COMPLETED' ? {...s, label: 'In stock'} : s));
  const at = steps.findIndex((s) => s.key === wo.status);
  return (
    <ol className="flex overflow-x-auto pb-1" aria-label="Progress">
      {steps.map((s, i) => {
        const done = wo.status !== 'CANCELLED' && i < at;
        const current = i === at;
        return (
          <li key={s.key} className="flex min-w-[6.5rem] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : done || current ? 'bg-walnut' : 'bg-ivory-300'}`} />
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  done ? 'border-walnut bg-walnut text-white' : current ? 'border-walnut bg-brass-soft text-walnut' : 'border-ivory-300 bg-white text-outline'
                }`}
              >
                {done ? <Check size={14} /> : i + 1}
              </span>
              <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'invisible' : done ? 'bg-walnut' : 'bg-ivory-300'}`} />
            </div>
            <span className={`mt-1.5 text-[11px] font-semibold ${current ? 'text-walnut' : 'text-on-surface-variant'}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
};

const Card = ({title, children, action}: {title: string; children: ReactNode; action?: ReactNode}) => (
  <section className="panel p-4 md:p-5">
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-ivory-300 pb-1.5">
      <h2 className="text-label-caps uppercase text-burgundy">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Row = ({label, children}: {label: string; children: ReactNode}) => (
  <div className="flex justify-between gap-3 py-1 text-sm">
    <dt className="text-on-surface-variant">{label}</dt>
    <dd className="text-right font-medium text-espresso">{children ?? '—'}</dd>
  </div>
);

/** What to do next, by status */
const NextStep = ({wo, onDeliver}: {wo: WorkOrder; onDeliver: () => void}) => {
  const issue = useIssueMaterial();
  const qc = useRecordQc();
  const complete = useCompleteWorkOrder();
  const [qcNotes, setQcNotes] = useState('');
  const [qcError, setQcError] = useState('');
  const [rack, setRack] = useState(wo.rackNo ?? '');
  const toIssue = wo.materials.filter((m) => m.toIssue > 0);
  const short = toIssue.filter((m) => m.toIssue > m.inStock);

  const box = (icon: ReactNode, title: string, text: ReactNode, action?: ReactNode) => (
    <div className="flex flex-col gap-3 rounded-xl border border-brass/40 bg-brass-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-walnut">{icon}</span>
        <div>
          <p className="font-semibold text-espresso">{title}</p>
          <div className="text-sm text-on-surface-variant">{text}</div>
        </div>
      </div>
      {action}
    </div>
  );

  switch (wo.status) {
    case 'PLANNED':
      return wo.materials.length
        ? box(
            <PackageMinus size={20} />,
            'Issue raw material',
            short.length ? (
              <span className="text-error">Not enough stock of {short.map((m) => m.variant.product.name).join(', ')}. Purchase it, or issue what is there line by line.</span>
            ) : (
              `${toIssue.length} material${toIssue.length === 1 ? '' : 's'} leave the godown for this job. Stock goes down now.`
            ),
            <button type="button" className="btn-primary" disabled={issue.isPending || !!short.length} onClick={() => issue.mutate({id: wo.id})}>
              {issue.isPending ? <Loader2 size={14} className="animate-spin" /> : <PackageMinus size={14} />} Issue all material
            </button>,
          )
        : box(<Factory size={20} />, 'Start production', 'No raw material is planned. Tick the first stage below when work starts.');
    case 'MATERIAL_ISSUED':
    case 'IN_PROGRESS':
      return box(<Factory size={20} />, 'In production', 'Tick each stage below as it is finished. The last stage sends the job to quality check.');
    case 'QUALITY_CHECK':
      if (wo.qcPassed) {
        return box(
          <PackageCheck size={20} />,
          wo.type === 'MADE_TO_STOCK' ? 'Move to stock' : 'Mark as completed',
          wo.type === 'MADE_TO_STOCK' ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span>{wo.quantity} pcs go into stock on rack</span>
              <input className="field-input w-28 px-2 py-1 text-sm" value={rack} maxLength={40} placeholder="SR-A2" onChange={(e) => setRack(e.target.value)} aria-label="Rack" />
            </div>
          ) : (
            'QC passed. Complete it, then schedule the delivery to the customer.'
          ),
          <button type="button" className="btn-primary" disabled={complete.isPending} onClick={() => complete.mutate({id: wo.id, rackNo: rack.trim() || undefined})}>
            {complete.isPending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} {wo.type === 'MADE_TO_STOCK' ? 'Add to stock' : 'Complete'}
          </button>,
        );
      }
      return (
        <div className="rounded-xl border border-brass/40 bg-brass-soft/40 p-4">
          <div className="flex items-start gap-3">
            <ClipboardCheck size={20} className="mt-0.5 text-walnut" />
            <div className="flex-1">
              <p className="font-semibold text-espresso">Quality check</p>
              <p className="text-sm text-on-surface-variant">Check size, joints, finish, fabric and hardware against the design.</p>
              <textarea
                className="field-input mt-2 w-full px-3 py-2 text-sm aria-[invalid=true]:border-error"
                rows={2}
                maxLength={1000}
                value={qcNotes}
                aria-invalid={!!qcError}
                placeholder="QC notes (required when it fails)"
                onChange={(e) => setQcNotes(e.target.value)}
              />
              {qcError && <p className="text-xs text-error">{qcError}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={qc.isPending} onClick={() => qc.mutate({id: wo.id, passed: true, notes: qcNotes.trim() || undefined})}>
                  <CheckCircle2 size={14} /> Pass
                </button>
                <button
                  type="button"
                  className="btn-ghost text-error"
                  disabled={qc.isPending}
                  onClick={() => {
                    if (qcNotes.trim().length < 3) return setQcError('Note what failed so it can be fixed');
                    setQcError('');
                    qc.mutate({id: wo.id, passed: false, notes: qcNotes.trim()});
                  }}
                >
                  <XCircle size={14} /> Fail: send for rework
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    case 'COMPLETED':
      return wo.type === 'MADE_TO_ORDER'
        ? box(
            <Truck size={20} />,
            wo.deliveries.some((d) => ['SCHEDULED', 'OUT_FOR_DELIVERY'].includes(d.status)) ? 'Delivery scheduled' : 'Schedule the delivery',
            wo.deliveries.length ? `${wo.deliveries[0].deliveryNumber} on ${shortDate(wo.deliveries[0].scheduledDate)} · ${DELIVERY_STATUS[wo.deliveries[0].status].label}` : 'Ready to go to the customer.',
            !wo.deliveries.some((d) => ['SCHEDULED', 'OUT_FOR_DELIVERY'].includes(d.status)) ? (
              <button type="button" className="btn-primary" onClick={onDeliver}>
                <Truck size={14} /> Schedule delivery
              </button>
            ) : (
              <Link to="/shop-admin/deliveries" className="btn-ghost">
                Open deliveries
              </Link>
            ),
          )
        : box(<CheckCircle2 size={20} />, 'In stock', `${wo.quantity} pcs added to stock${wo.rackNo ? ` on rack ${wo.rackNo}` : ''} on ${shortDate(wo.completedAt)}.`);
    case 'DELIVERED':
      return box(<CheckCircle2 size={20} />, 'Delivered', `Delivered to ${wo.customerName} on ${shortDate(wo.deliveredAt)}.`);
    case 'CANCELLED':
      return box(<Ban size={20} />, 'Cancelled', wo.cancelReason ?? 'Issued material went back to stock.');
  }
};

const MaterialsTable = ({wo}: {wo: WorkOrder}) => {
  const issue = useIssueMaterial();
  const ret = useReturnMaterial();
  const [returning, setReturning] = useState<WorkOrderMaterial | null>(null);
  const [qty, setQty] = useState('');
  const [qtyErr, setQtyErr] = useState('');
  const open = ['PLANNED', 'MATERIAL_ISSUED', 'IN_PROGRESS'].includes(wo.status);
  if (!wo.materials.length) return <p className="text-sm text-on-surface-variant">No raw material on this job.</p>;
  return (
    <>
      <div className="table-wrap -mx-1">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs font-semibold text-on-surface-variant">
            <tr className="border-b border-ivory-300">
              <th className="px-2 py-2">Material</th>
              <th className="px-2 py-2 text-right">Planned</th>
              <th className="px-2 py-2 text-right">Issued</th>
              <th className="px-2 py-2 text-right">Returned</th>
              <th className="px-2 py-2 text-right">In stock</th>
              <th className="px-2 py-2 text-right">Cost</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {wo.materials.map((m) => {
              const used = m.issuedQty - m.returnedQty;
              return (
                <tr key={m.id} className="border-b border-ivory-200 last:border-0">
                  <td className="px-2 py-2">
                    <p className="font-medium text-espresso">{m.variant.product.name}</p>
                    <p className="text-xs text-outline">
                      {m.variant.variantName}
                      {m.rackNo ? ` · rack ${m.rackNo}` : ''}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {m.plannedQty} <span className="text-xs text-outline">{m.variant.product.unit ?? ''}</span>
                  </td>
                  <td className="px-2 py-2 text-right">{m.issuedQty}</td>
                  <td className="px-2 py-2 text-right">{m.returnedQty || '—'}</td>
                  <td className={`px-2 py-2 text-right ${m.toIssue > m.inStock ? 'font-semibold text-error' : ''}`}>{m.inStock}</td>
                  <td className="px-2 py-2 text-right">{inr(used * m.unitCost)}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {open && m.toIssue > 0 && (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs"
                          disabled={issue.isPending || m.inStock < 1}
                          onClick={() => issue.mutate({id: wo.id, lines: [{variantId: m.variantId, quantity: Math.min(m.toIssue, m.inStock)}]})}
                        >
                          Issue {Math.min(m.toIssue, m.inStock)}
                        </button>
                      )}
                      {used > 0 && !['DELIVERED', 'CANCELLED'].includes(wo.status) && (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={() => {
                            setReturning(m);
                            setQty('');
                            setQtyErr('');
                          }}
                        >
                          <RotateCcw size={12} /> Return
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {returning && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-ivory-100 p-3">
          <label className="text-xs font-semibold text-on-surface-variant">
            Return unused {returning.variant.product.name} (max {returning.issuedQty - returning.returnedQty})
            <input
              className="field-input mt-1 w-32 px-2 py-1.5 text-sm"
              inputMode="numeric"
              value={qty}
              aria-invalid={!!qtyErr}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={ret.isPending}
            onClick={() => {
              const n = Number(qty);
              const max = returning.issuedQty - returning.returnedQty;
              if (!n || n < 1) return setQtyErr('Enter a quantity');
              if (n > max) return setQtyErr(`At most ${max}`);
              ret.mutate({id: wo.id, lines: [{variantId: returning.variantId, quantity: n}]}, {onSuccess: () => setReturning(null)});
            }}
          >
            Return to stock
          </button>
          <button type="button" className="btn-ghost" onClick={() => setReturning(null)}>
            Cancel
          </button>
          {qtyErr && <p className="w-full text-xs text-error">{qtyErr}</p>}
        </div>
      )}
    </>
  );
};

const Stages = ({wo}: {wo: WorkOrder}) => {
  const setStage = useSetStage();
  const canTick = ['MATERIAL_ISSUED', 'IN_PROGRESS', 'QUALITY_CHECK'].includes(wo.status) || (wo.status === 'PLANNED' && wo.materials.length === 0);
  return (
    <ol className="space-y-1.5">
      {wo.stages.map((s, i) => (
        <li key={s.key}>
          <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${s.done ? 'border-walnut/30 bg-brass-soft/30' : 'border-ivory-300 bg-white'} ${canTick ? 'cursor-pointer' : 'opacity-70'}`}>
            <input
              type="checkbox"
              className="h-5 w-5 accent-walnut"
              checked={s.done}
              disabled={!canTick || setStage.isPending}
              onChange={(e) => setStage.mutate({id: wo.id, key: s.key, done: e.target.checked})}
            />
            <span className="flex-1">
              <span className={`text-sm font-medium ${s.done ? 'text-espresso' : 'text-on-surface-variant'}`}>
                {i + 1}. {s.label}
              </span>
              {s.done && s.at && (
                <span className="block text-xs text-outline">
                  {new Date(s.at).toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'})}
                  {s.by ? ` · ${s.by}` : ''}
                </span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ol>
  );
};

/** /shop-admin/work-orders/:workOrderId */
const WorkOrderDetailPage = () => {
  const {workOrderId} = useParams({strict: false}) as {workOrderId: string};
  const navigate = useNavigate();
  const {data: wo, isPending, isError, error} = useWorkOrder(workOrderId);
  const cancel = useCancelWorkOrder();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const open = wo && ['PLANNED', 'MATERIAL_ISSUED', 'IN_PROGRESS', 'QUALITY_CHECK'].includes(wo.status);

  return (
    <>
      <PageHeader
        compact
        breadcrumbs={[{label: 'Work Orders', to: '/shop-admin/work-orders'}, {label: wo?.woNumber ?? '…'}]}
        title={wo ? `${wo.woNumber} · ${wo.title}` : 'Work order'}
        actions={
          wo && (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <WoStatusPill status={wo.status} overdue={wo.overdue} />
              <button type="button" className="btn-ghost" onClick={() => window.print()}>
                <Printer size={14} /> Job card
              </button>
              {open && (
                <>
                  <button type="button" className="btn-ghost" onClick={() => navigate({to: '/shop-admin/work-orders/edit/$workOrderId', params: {workOrderId: wo.id}})}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button type="button" className="btn-ghost text-error" onClick={() => setConfirmCancel(true)}>
                    <Ban size={14} /> Cancel
                  </button>
                </>
              )}
            </div>
          )
        }
      />

      {isPending ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading work order…
        </div>
      ) : isError || !wo ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-serif text-headline-sm text-walnut">Work order not available</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">{getErrorMessage(error, 'It may have been removed.')}</p>
          <Link to="/shop-admin/work-orders" className="btn-ghost mt-4">
            Back to work orders
          </Link>
        </div>
      ) : (
        <div className="print-area space-y-4">
          <section className="panel space-y-4 p-4 md:p-5">
            <Stepper wo={wo} />
            <div className="print:hidden">
              <NextStep wo={wo} onDeliver={() => setDelivering(true)} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
            <div className="min-w-0 space-y-4">
              <Card title={`Process stages · ${wo.progress}%`} action={<ProgressBar value={wo.progress} />}>
                <Stages wo={wo} />
                {wo.qcNotes && (
                  <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${wo.qcPassed === false ? 'bg-error-container text-on-error-container' : 'bg-ivory-100 text-on-surface-variant'}`}>
                    <strong>QC:</strong> {wo.qcNotes}
                  </p>
                )}
              </Card>

              <Card title="Raw material">
                <MaterialsTable wo={wo} />
              </Card>

              <Card title="Design & size">
                <dl className="grid gap-x-6 sm:grid-cols-2">
                  <Row label="Category">{wo.category}</Row>
                  <Row label="Type">{wo.productType}</Row>
                  <Row label="Size (L × W × H)">{wo.lengthCm && wo.widthCm && wo.heightCm ? `${wo.lengthCm} × ${wo.widthCm} × ${wo.heightCm} cm` : null}</Row>
                  <Row label="Customer size">{wo.sizeNote}</Row>
                  <Row label="Material">{wo.material}</Row>
                  <Row label="Finish">{wo.finish ?? wo.variant?.finish}</Row>
                  <Row label="Colour">{wo.colour}</Row>
                  <Row label="Catalogue item">{wo.product ? `${wo.product.name}${wo.variant ? ` · ${wo.variant.variantName}` : ''}` : 'Custom piece'}</Row>
                </dl>
                {wo.accessories.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold text-on-surface-variant">Accessories</p>
                    <ul className="divide-y divide-ivory-200 rounded-lg border border-ivory-300">
                      {wo.accessories.map((a, i) => (
                        <li key={i} className="flex justify-between px-3 py-2 text-sm">
                          <span>
                            {a.name} × {a.quantity}
                          </span>
                          <span className="font-medium">{inr(a.price * a.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {wo.designImages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {wo.designImages.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="h-28 w-28 overflow-hidden rounded-lg border border-ivory-300">
                        <img src={u} alt="Design" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {wo.specNotes && <p className="mt-3 whitespace-pre-line rounded-lg bg-ivory-100 px-3 py-2 text-sm text-espresso">{wo.specNotes}</p>}
              </Card>
            </div>

            <aside className="space-y-4">
              <Card title="Job">
                <dl>
                  <Row label="Type">{WO_TYPE_LABEL[wo.type]}</Row>
                  <Row label="Quantity">{wo.quantity} pcs</Row>
                  <Row label="Priority">
                    <span className={PRIORITY[wo.priority].cls}>{PRIORITY[wo.priority].label}</span>
                  </Row>
                  <Row label="Karigar / supervisor">{wo.assignedTo?.fullname}</Row>
                  <Row label="Start">{shortDate(wo.startDate)}</Row>
                  <Row label="Due">
                    <span className={wo.overdue ? 'text-error' : ''}>{shortDate(wo.dueDate)}</span>
                  </Row>
                  {wo.rackNo && <Row label="Rack">{wo.rackNo}</Row>}
                </dl>
                {wo.notes && <p className="mt-2 text-sm text-on-surface-variant">{wo.notes}</p>}
              </Card>

              {wo.type === 'MADE_TO_ORDER' && (
                <Card title="Customer">
                  <p className="font-medium text-espresso">{wo.customerName}</p>
                  <p className="text-sm text-on-surface-variant">{wo.customerPhone}</p>
                  {wo.customerAddress && <p className="mt-1 text-sm text-on-surface-variant">{wo.customerAddress}</p>}
                  {wo.quotedPrice !== null && (
                    <dl className="mt-3 border-t border-ivory-200 pt-2">
                      <Row label="Agreed price">{inr(wo.quotedPrice)}</Row>
                      <Row label="Advance paid">{inr(wo.advancePaid)}</Row>
                      <Row label="Balance due">
                        <span className="text-brass-deep">{inr(wo.quotedPrice - wo.advancePaid)}</span>
                      </Row>
                    </dl>
                  )}
                </Card>
              )}

              <Card title="Cost">
                <dl>
                  <Row label="Raw material (issued)">{inr(wo.cost.material)}</Row>
                  <Row label="Accessories">{inr(wo.cost.accessories)}</Row>
                  <Row label="Labour">{inr(wo.cost.labour)}</Row>
                  <Row label="Overhead">{inr(wo.cost.overhead)}</Row>
                  <div className="mt-1 border-t border-ivory-200 pt-1">
                    <Row label="Total cost">{inr(wo.cost.total)}</Row>
                    <Row label="Cost per piece">{inr(wo.cost.perUnit)}</Row>
                    {wo.cost.margin !== null && (
                      <Row label="Margin on agreed price">
                        <span className={wo.cost.margin < 0 ? 'text-error' : 'text-secondary'}>{inr(wo.cost.margin)}</span>
                      </Row>
                    )}
                  </div>
                </dl>
              </Card>

              {wo.deliveries.length > 0 && (
                <Card title="Deliveries">
                  <ul className="space-y-2">
                    {wo.deliveries.map((d) => (
                      <li key={d.id} className="flex items-center justify-between text-sm">
                        <span>
                          {d.deliveryNumber}
                          <span className="block text-xs text-outline">{shortDate(d.scheduledDate)}</span>
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DELIVERY_STATUS[d.status].cls}`}>{DELIVERY_STATUS[d.status].label}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </aside>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel work order?"
        message="Material still with this job goes back to stock. This cannot be undone."
        confirmLabel="Cancel work order"
        tone="danger"
        requireReason
        reasonLabel="Reason"
        isLoading={cancel.isPending}
        onConfirm={(reason) => wo && cancel.mutate({id: wo.id, reason: reason ?? ''}, {onSuccess: () => setConfirmCancel(false)})}
        onCancel={() => setConfirmCancel(false)}
      />
      {wo && delivering && (
        <ScheduleDeliveryDialog
          open
          onClose={() => setDelivering(false)}
          prefill={{
            workOrderId: wo.id,
            customerName: wo.customerName ?? '',
            customerPhone: wo.customerPhone ?? '',
            address: wo.customerAddress ?? '',
            items: [{name: wo.title, quantity: wo.quantity}, ...wo.accessories.map((a) => ({name: a.name, quantity: a.quantity}))],
            installation: true,
          }}
        />
      )}
    </>
  );
};

export default WorkOrderDetailPage;
