import {Column, ConfirmDialog, GenericTable} from '@/components/Forms';
import ListToolbar from '@/components/Org/ListToolbar';
import {PageHeader} from '@/components/ui';
import useDebounce from '@/hooks/useDebounce';
import {useAssignDelivery, useDeliveries, useDeliveryStatus, useDeliveryTeam} from '@/lib/react-query/queriesAndMutations/manufacturing';
import {Delivery, DELIVERY_STATUS, DeliveryStatus, SLOT_LABEL} from '@/types/manufacturing';
import {getErrorMessage} from '@/utils/axios';
import {Link} from '@tanstack/react-router';
import {CheckCircle2, MapPin, Phone, Plus, Truck, Wrench, XCircle} from 'lucide-react';
import {useState} from 'react';
import ScheduleDeliveryDialog from './ScheduleDeliveryDialog';
import {shortDate} from './WorkOrderListPage';

type Day = 'today' | 'upcoming' | 'overdue' | undefined;
const TABS: {label: string; value: string | undefined}[] = [
  {label: 'All', value: undefined},
  {label: 'Today', value: 'day:today'},
  {label: 'Upcoming', value: 'day:upcoming'},
  {label: 'Overdue', value: 'day:overdue'},
  {label: 'Out for delivery', value: 'OUT_FOR_DELIVERY'},
  {label: 'Delivered', value: 'DELIVERED'},
  {label: 'Failed', value: 'FAILED'},
];

/** Assign a person / reschedule, inline */
const AssignCell = ({d}: {d: Delivery}) => {
  const {data: team} = useDeliveryTeam();
  const assign = useAssignDelivery();
  const active = d.status === 'SCHEDULED' || d.status === 'OUT_FOR_DELIVERY';
  if (!active) return <span className="text-sm">{d.assignedTo?.fullname ?? '—'}</span>;
  return (
    <select
      className="field-input min-h-[34px] max-w-[11rem] px-2 py-1 text-sm"
      value={d.assignedTo?.id ?? ''}
      aria-label="Delivery person"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => assign.mutate({id: d.id, assignedToId: e.target.value || undefined})}
    >
      <option value="">Not assigned</option>
      {team?.map((t) => (
        <option key={t.id} value={t.id}>
          {t.fullname}
        </option>
      ))}
    </select>
  );
};

/** /shop-admin/deliveries */
const DeliveriesPage = () => {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText, 300);
  const day = (tab?.startsWith('day:') ? tab.slice(4) : undefined) as Day;
  const status = tab && !tab.startsWith('day:') ? (tab as DeliveryStatus) : undefined;
  const {data, isPending, isFetching, isError, error, refetch} = useDeliveries({page, limit: 10, status, day, search: search || undefined});
  const setStatus = useDeliveryStatus();
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<{d: Delivery; status: 'FAILED' | 'CANCELLED'} | null>(null);
  const s = data?.summary;

  const columns: Column<Delivery>[] = [
    {
      header: 'Delivery',
      render: (d) => (
        <div>
          <p className="font-semibold text-espresso">{d.deliveryNumber}</p>
          <p className="text-xs text-outline">
            {d.workOrder ? `WO ${d.workOrder.woNumber}` : d.order ? `Order ${d.order.orderNumber}` : d.salesBill ? `Bill ${d.salesBill.billNumber}` : 'Manual'}
          </p>
          {d.installation && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brass-deep">
              <Wrench size={11} /> Installation
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Customer',
      render: (d) => (
        <div className="max-w-[16rem]">
          <p className="text-espresso">{d.customerName}</p>
          <a href={`tel:${d.customerPhone}`} className="inline-flex items-center gap-1 text-xs text-walnut" onClick={(e) => e.stopPropagation()}>
            <Phone size={11} /> {d.customerPhone}
          </a>
          <p className="flex items-start gap-1 text-xs text-outline">
            <MapPin size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">
              {d.address}
              {d.city ? `, ${d.city}` : ''}
            </span>
          </p>
        </div>
      ),
    },
    {
      header: 'Items',
      hideBelow: 'lg',
      render: (d) => (
        <ul className="text-sm">
          {d.items.slice(0, 3).map((i, k) => (
            <li key={k}>
              {i.name} × {i.quantity}
            </li>
          ))}
          {d.items.length > 3 && <li className="text-xs text-outline">+{d.items.length - 3} more</li>}
        </ul>
      ),
    },
    {
      header: 'When',
      render: (d) => (
        <div className="text-sm">
          <p>{shortDate(d.scheduledDate)}</p>
          <p className="text-xs text-outline">{d.slot ? SLOT_LABEL[d.slot] : ''}</p>
        </div>
      ),
    },
    {header: 'Delivery person', hideBelow: 'md', render: (d) => <AssignCell d={d} />},
    {
      header: 'Status',
      render: (d) => (
        <div className="flex flex-col items-start gap-1">
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${DELIVERY_STATUS[d.status].cls}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {DELIVERY_STATUS[d.status].label}
          </span>
          {d.outcomeNote && <span className="max-w-[10rem] text-[11px] text-outline">{d.outcomeNote}</span>}
        </div>
      ),
    },
  ];

  const kpis = [
    {label: 'Today', value: s?.today ?? 0},
    {label: 'Scheduled', value: s?.byStatus.SCHEDULED ?? 0},
    {label: 'Out for delivery', value: s?.byStatus.OUT_FOR_DELIVERY ?? 0},
    {label: 'Delivered', value: s?.byStatus.DELIVERED ?? 0},
    {label: 'Overdue', value: s?.overdue ?? 0, alert: true},
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{label: 'Delivery'}, {label: 'Deliveries'}]}
        title="Deliveries"
        subtitle="Who delivers what, where and when, and whether it was installed. Delivering closes the work order or online order."
        actions={
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Schedule Delivery
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
        caption="Deliveries"
        columns={columns}
        data={data?.items}
        loading={isPending}
        fetching={isFetching}
        error={isError ? error : undefined}
        errorMessage={getErrorMessage(error, 'Failed to load deliveries')}
        onRetry={() => refetch()}
        emptyIcon={<Truck size={22} strokeWidth={1.5} />}
        emptyTitle={tab || search ? 'No matching deliveries' : 'No deliveries yet'}
        emptyMessage={tab || search ? undefined : 'Completed made-to-order work orders and home-delivery bills are scheduled here.'}
        rowActions={(d) => [
          ...(d.status === 'SCHEDULED'
            ? [{label: 'Out for delivery', icon: <Truck size={16} />, onClick: () => setStatus.mutate({id: d.id, status: 'OUT_FOR_DELIVERY'})}]
            : []),
          ...(d.status === 'SCHEDULED' || d.status === 'OUT_FOR_DELIVERY'
            ? [
                {label: 'Delivered', icon: <CheckCircle2 size={16} />, onClick: () => setStatus.mutate({id: d.id, status: 'DELIVERED'})},
                {label: 'Failed', icon: <XCircle size={16} />, tone: 'danger' as const, onClick: () => setClosing({d, status: 'FAILED'})},
                {label: 'Cancel', icon: <XCircle size={16} />, tone: 'danger' as const, onClick: () => setClosing({d, status: 'CANCELLED'})},
              ]
            : []),
        ]}
        pagination={data?.pagination}
        onPageChange={setPage}
        toolbar={
          <ListToolbar
            tabs={TABS.map((t) => ({...t, count: t.value === 'day:today' ? s?.today : t.value === 'day:overdue' ? s?.overdue : t.value && !t.value.startsWith('day:') ? s?.byStatus[t.value as DeliveryStatus] : undefined}))}
            tab={tab}
            onTab={(v) => {
              setTab(v as string | undefined);
              setPage(1);
            }}
            searchText={searchText}
            onSearch={(t) => {
              setSearchText(t);
              setPage(1);
            }}
            placeholder="Search number, customer, phone or city"
          />
        }
      />
      <p className="mt-3 text-xs text-outline">
        Made-to-order jobs are scheduled from their{' '}
        <Link to="/shop-admin/work-orders" className="text-walnut underline">
          work order
        </Link>{' '}
        once QC passes.
      </p>

      {adding && <ScheduleDeliveryDialog open onClose={() => setAdding(false)} prefill={{}} />}
      <ConfirmDialog
        open={!!closing}
        title={closing?.status === 'FAILED' ? 'Mark delivery failed?' : 'Cancel delivery?'}
        message={`${closing?.d.deliveryNumber} for ${closing?.d.customerName}. Tell us why.`}
        confirmLabel={closing?.status === 'FAILED' ? 'Mark failed' : 'Cancel delivery'}
        tone="danger"
        requireReason
        reasonLabel="Reason"
        isLoading={setStatus.isPending}
        onConfirm={(reason) => closing && setStatus.mutate({id: closing.d.id, status: closing.status, outcomeNote: reason}, {onSuccess: () => setClosing(null)})}
        onCancel={() => setClosing(null)}
      />
    </>
  );
};

export default DeliveriesPage;
