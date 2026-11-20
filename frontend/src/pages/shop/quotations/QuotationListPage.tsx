import {Column, ConfirmDialog, GenericTable} from '@/components/Forms';
import ListToolbar from '@/components/Org/ListToolbar';
import {PageHeader} from '@/components/ui';
import useDebounce from '@/hooks/useDebounce';
import {useDeleteQuotation, useQuotations} from '@/lib/react-query/queriesAndMutations/quotation';
import {QUOTATION_STATUS, QuotationListItem, QuotationStatus} from '@/types/quotation';
import {getErrorMessage} from '@/utils/axios';
import {inr} from '@/utils/money';
import {useNavigate} from '@tanstack/react-router';
import {Eye, FilePlus2, FileText, Pencil, Receipt, Trash2} from 'lucide-react';
import {useState} from 'react';

export const QuotationStatusPill = ({status, expired}: {status: QuotationStatus; expired?: boolean}) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      expired ? 'bg-[#F6E6C8] text-[#8A5A12]' : QUOTATION_STATUS[status].cls
    }`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {expired ? 'Expired' : QUOTATION_STATUS[status].label}
  </span>
);

const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'});

const TABS: {label: string; value: QuotationStatus | undefined}[] = [
  {label: 'All', value: undefined},
  {label: 'Draft', value: 'DRAFT'},
  {label: 'Sent', value: 'SENT'},
  {label: 'Accepted', value: 'ACCEPTED'},
  {label: 'Billed', value: 'CONVERTED'},
  {label: 'Rejected', value: 'REJECTED'},
];

/** /shop-admin/quotations */
const QuotationListPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<QuotationStatus | undefined>();
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText, 300);
  const {data, isPending, isFetching, isError, error, refetch} = useQuotations({
    page,
    limit: 10,
    status,
    search: search || undefined,
  });
  const remove = useDeleteQuotation();
  const [toDelete, setToDelete] = useState<QuotationListItem | null>(null);

  const view = (q: QuotationListItem) => navigate({to: '/shop-admin/quotations/$quotationId', params: {quotationId: q.id}});
  const summary = data?.summary ?? {};
  const open = (['DRAFT', 'SENT', 'ACCEPTED'] as const).reduce(
    (t, s) => ({count: t.count + (summary[s]?.count ?? 0), value: t.value + (summary[s]?.value ?? 0)}),
    {count: 0, value: 0},
  );
  const won = summary.CONVERTED ?? {count: 0, value: 0};
  const lost = summary.REJECTED?.count ?? 0;
  const decided = won.count + lost;

  const columns: Column<QuotationListItem>[] = [
    {
      header: 'Quotation',
      render: (q) => (
        <div>
          <p className="font-semibold text-espresso">{q.quotationNumber}</p>
          <p className="text-xs text-outline">
            {date(q.quoteDate)} · {q.itemCount} item{q.itemCount === 1 ? '' : 's'}
          </p>
        </div>
      ),
    },
    {
      header: 'Customer',
      render: (q) => (
        <div>
          <p className="text-espresso">{q.customerName}</p>
          <p className="text-xs text-outline">{q.customerPhone}</p>
        </div>
      ),
    },
    {
      header: 'Type',
      hideBelow: 'lg',
      render: (q) => <span className={q.saleType === 'WHOLESALE' ? 'badge-ribbon' : 'badge-inactive'}>{q.saleType === 'WHOLESALE' ? 'Wholesale' : 'Retail'}</span>,
    },
    {header: 'Valid until', hideBelow: 'md', render: (q) => <span className="text-sm">{date(q.validUntil)}</span>},
    {header: 'Amount', align: 'right', render: (q) => <span className="font-semibold">{inr(q.totalAmount)}</span>},
    {
      header: 'Status',
      render: (q) => (
        <div className="flex flex-col items-start gap-1">
          <QuotationStatusPill status={q.status} expired={q.expired} />
          {q.salesBill && <span className="text-[11px] text-outline">Bill {q.salesBill.billNumber}</span>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{label: 'Sales'}, {label: 'Quotations'}]}
        title="Quotations"
        subtitle="Price quotes for customers. When the customer agrees, bill it in one click: items, prices and customer carry over to the POS."
        actions={
          <button type="button" className="btn-primary" onClick={() => navigate({to: '/shop-admin/quotations/new'})}>
            <FilePlus2 size={16} /> New Quotation
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {label: 'Open quotes', value: String(open.count), note: inr(open.value)},
          {label: 'Accepted, to bill', value: String(summary.ACCEPTED?.count ?? 0), note: inr(summary.ACCEPTED?.value ?? 0)},
          {label: 'Billed', value: String(won.count), note: inr(won.value)},
          {label: 'Win rate', value: decided ? `${Math.round((won.count / decided) * 100)}%` : '—', note: `${lost} rejected`},
        ].map((k) => (
          <div key={k.label} className="panel p-4">
            <p className="text-xs font-semibold text-outline">{k.label}</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-walnut">{k.value}</p>
            <p className="text-xs text-on-surface-variant">{k.note}</p>
          </div>
        ))}
      </div>

      <GenericTable
        caption="Quotations"
        columns={columns}
        data={data?.items}
        loading={isPending}
        fetching={isFetching}
        error={isError ? error : undefined}
        errorMessage={getErrorMessage(error, 'Failed to load quotations')}
        onRetry={() => refetch()}
        emptyIcon={<FileText size={22} strokeWidth={1.5} />}
        emptyTitle={status || search ? 'No matching quotations' : 'No quotations yet'}
        emptyMessage={status || search ? undefined : 'Make a quote with catalog items or custom made-to-measure pieces.'}
        onRowClick={view}
        rowActions={(q) => [
          {label: 'View / Print', icon: <Eye size={16} />, onClick: view},
          ...(['DRAFT', 'SENT'].includes(q.status)
            ? [{label: 'Edit', icon: <Pencil size={16} />, onClick: () => navigate({to: '/shop-admin/quotations/edit/$quotationId', params: {quotationId: q.id}})}]
            : []),
          ...(['DRAFT', 'SENT', 'ACCEPTED'].includes(q.status)
            ? [{label: 'Bill it (POS)', icon: <Receipt size={16} />, onClick: () => navigate({to: '/shop-admin/new-bill', search: {quotation: q.id} as never})}]
            : []),
          ...(q.status === 'DRAFT'
            ? [{label: 'Delete', icon: <Trash2 size={16} />, tone: 'danger' as const, onClick: () => setToDelete(q)}]
            : []),
        ]}
        pagination={data?.pagination}
        onPageChange={setPage}
        toolbar={
          <ListToolbar
            tabs={TABS.map((t) => ({...t, count: t.value ? summary[t.value]?.count : undefined}))}
            tab={status}
            onTab={(v) => {
              setStatus(v as QuotationStatus | undefined);
              setPage(1);
            }}
            searchText={searchText}
            onSearch={(t) => {
              setSearchText(t);
              setPage(1);
            }}
            placeholder="Search number, customer or phone"
          />
        }
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete quotation?"
        message={`Draft ${toDelete?.quotationNumber} for ${toDelete?.customerName} will be deleted.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          await remove.mutateAsync(toDelete.id).catch(() => undefined);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
};

export default QuotationListPage;
