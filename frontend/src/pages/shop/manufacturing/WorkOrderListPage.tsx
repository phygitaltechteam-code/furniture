import {Column, GenericTable} from '@/components/Forms';
import ListToolbar from '@/components/Org/ListToolbar';
import {PageHeader} from '@/components/ui';
import useDebounce from '@/hooks/useDebounce';
import {useWorkOrders} from '@/lib/react-query/queriesAndMutations/manufacturing';
import {PRIORITY, WO_STATUS, WO_TYPE_LABEL, WorkOrderListItem, WorkOrderStatus, WorkOrderType} from '@/types/manufacturing';
import {getErrorMessage} from '@/utils/axios';
import {useNavigate} from '@tanstack/react-router';
import {AlertTriangle, Eye, Factory, Hammer, Plus} from 'lucide-react';
import {useState} from 'react';

export const WoStatusPill = ({status, overdue}: {status: WorkOrderStatus; overdue?: boolean}) => (
  <span className="inline-flex flex-col items-start gap-1">
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${WO_STATUS[status].cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {WO_STATUS[status].label}
    </span>
    {overdue && (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-error">
        <AlertTriangle size={11} /> Overdue
      </span>
    )}
  </span>
);

export const ProgressBar = ({value}: {value: number}) => (
  <div className="flex items-center gap-2" aria-label={`${value}% done`}>
    <div className="h-1.5 w-20 rounded-full bg-ivory-200">
      <div className="h-1.5 rounded-full bg-walnut" style={{width: `${value}%`}} />
    </div>
    <span className="text-xs text-on-surface-variant">{value}%</span>
  </div>
);

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}) : '—';

const TABS: {label: string; value: WorkOrderStatus | undefined}[] = [
  {label: 'All', value: undefined},
  {label: 'Planned', value: 'PLANNED'},
  {label: 'Material issued', value: 'MATERIAL_ISSUED'},
  {label: 'In production', value: 'IN_PROGRESS'},
  {label: 'Quality check', value: 'QUALITY_CHECK'},
  {label: 'Completed', value: 'COMPLETED'},
  {label: 'Delivered', value: 'DELIVERED'},
  {label: 'Cancelled', value: 'CANCELLED'},
];

/** /shop-admin/work-orders */
const WorkOrderListPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<WorkOrderStatus | undefined>();
  const [type, setType] = useState<WorkOrderType | undefined>();
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText, 300);
  const {data, isPending, isFetching, isError, error, refetch} = useWorkOrders({page, limit: 10, status, type, search: search || undefined});
  const s = data?.summary.byStatus ?? {};
  const view = (w: WorkOrderListItem) => navigate({to: '/shop-admin/work-orders/$workOrderId', params: {workOrderId: w.id}});

  const columns: Column<WorkOrderListItem>[] = [
    {
      header: 'Work order',
      render: (w) => (
        <div className="flex items-center gap-3">
          <div className="hidden h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ivory-200 sm:block">
            {w.product?.images[0] ? (
              <img src={w.product.images[0].url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-outline">
                <Hammer size={16} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-espresso">{w.woNumber}</p>
            <p className="truncate text-sm text-espresso">
              {w.title}
              {w.variant ? <span className="text-outline"> · {w.variant.variantName} / {w.variant.finish}</span> : null}
            </p>
            <p className={`text-xs ${PRIORITY[w.priority].cls}`}>
              {w.quantity} pc{w.quantity === 1 ? '' : 's'} · {PRIORITY[w.priority].label} priority
            </p>
          </div>
        </div>
      ),
    },
    {
      header: 'For',
      render: (w) =>
        w.type === 'MADE_TO_ORDER' ? (
          <div>
            <p className="text-espresso">{w.customerName}</p>
            <p className="text-xs text-outline">{w.customerPhone}</p>
          </div>
        ) : (
          <span className="badge-inactive">Stock{w.rackNo ? ` · ${w.rackNo}` : ''}</span>
        ),
    },
    {header: 'Progress', hideBelow: 'md', render: (w) => <ProgressBar value={w.progress} />},
    {header: 'Assigned', hideBelow: 'lg', render: (w) => <span className="text-sm">{w.assignedTo?.fullname ?? '—'}</span>},
    {header: 'Due', hideBelow: 'md', render: (w) => <span className={`text-sm ${w.overdue ? 'font-semibold text-error' : ''}`}>{shortDate(w.dueDate)}</span>},
    {header: 'Status', render: (w) => <WoStatusPill status={w.status} overdue={w.overdue} />},
  ];

  const kpis = [
    {label: 'Waiting for material', value: s.PLANNED ?? 0},
    {label: 'In production', value: (s.MATERIAL_ISSUED ?? 0) + (s.IN_PROGRESS ?? 0)},
    {label: 'Quality check', value: s.QUALITY_CHECK ?? 0},
    {label: 'Ready / delivered', value: (s.COMPLETED ?? 0) + (s.DELIVERED ?? 0)},
    {label: 'Overdue', value: data?.summary.overdue ?? 0, alert: true},
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{label: 'Manufacturing'}, {label: 'Work Orders'}]}
        title="Work Orders"
        subtitle="Every job in the workshop: raw material out, process stages, quality check, then into stock or to the customer."
        actions={
          <button type="button" className="btn-primary" onClick={() => navigate({to: '/shop-admin/work-orders/new'})}>
            <Plus size={16} /> New Work Order
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="panel p-4">
            <p className="text-xs font-semibold text-outline">{k.label}</p>
            <p className={`mt-1 font-serif text-2xl font-semibold ${k.alert && k.value ? 'text-error' : 'text-walnut'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <GenericTable
        caption="Work orders"
        columns={columns}
        data={data?.items}
        loading={isPending}
        fetching={isFetching}
        error={isError ? error : undefined}
        errorMessage={getErrorMessage(error, 'Failed to load work orders')}
        onRetry={() => refetch()}
        emptyIcon={<Factory size={22} strokeWidth={1.5} />}
        emptyTitle={status || type || search ? 'No matching work orders' : 'No work orders yet'}
        emptyMessage={status || type || search ? undefined : 'Start a job for stock, or for a customer’s made-to-order piece.'}
        onRowClick={view}
        rowActions={() => [{label: 'Open', icon: <Eye size={16} />, onClick: view}]}
        pagination={data?.pagination}
        onPageChange={setPage}
        toolbar={
          <div className="space-y-2">
            <ListToolbar
              tabs={TABS.map((t) => ({...t, count: t.value ? s[t.value] : undefined}))}
              tab={status}
              onTab={(v) => {
                setStatus(v as WorkOrderStatus | undefined);
                setPage(1);
              }}
              searchText={searchText}
              onSearch={(t) => {
                setSearchText(t);
                setPage(1);
              }}
              placeholder="Search WO no, item, customer, phone or rack"
            />
            <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Work order type">
              {([undefined, 'MADE_TO_STOCK', 'MADE_TO_ORDER'] as const).map((t) => (
                <button
                  key={t ?? 'all'}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => {
                    setType(t);
                    setPage(1);
                  }}
                  className={`min-h-[32px] rounded-full border px-3 text-xs font-semibold ${type === t ? 'border-walnut bg-walnut text-white' : 'border-ivory-300 bg-white text-on-surface-variant hover:border-walnut'}`}
                >
                  {t ? WO_TYPE_LABEL[t] : 'All types'}
                </button>
              ))}
            </div>
          </div>
        }
      />
    </>
  );
};

export default WorkOrderListPage;
