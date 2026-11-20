import {AnalyticsPanel} from '@/lib/api/analytics';
import {inr as money, inrShort} from '@/utils/money';
import {useAnalytics} from '@/lib/react-query/queriesAndMutations/analytics';
import {Analytics, AnalyticsDays} from '@/types/analytics';
import {AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2} from 'lucide-react';
import {ReactNode, useState} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/*
 * Business dashboard shared by every role: KPIs, revenue trend, branch,
 * category, product and salesperson performance. The API decides the scope
 * (platform, company or one branch).
 *
 * Series colours were checked with the dataviz validator (light and dark):
 * counter = rust, online = blue. Single-series charts use the counter hue.
 */
const SERIES = {counter: '#B5532A', online: '#2B78A8'};
const AXIS = '#8A817A';
const GRID = 'rgba(138,129,122,0.18)';
const RANGES: {days: AnalyticsDays; label: string}[] = [
  {days: 7, label: '7 days'},
  {days: 30, label: '30 days'},
  {days: 90, label: '90 days'},
  {days: 365, label: '1 year'},
];

const inr = (n: number) => money(Math.round(n));
/** ₹12L / ₹1.2Cr / ₹8K — chart axes only */
const axisInr = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${Math.round(n)}`;
};
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

const Tile = ({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  tone?: 'good' | 'bad' | 'warn';
}) => (
  <div className="panel min-w-0 p-4">
    <p className="truncate text-label-caps uppercase text-outline">{label}</p>
    <p className="mt-1 truncate font-serif text-headline-sm text-burgundy" title={value}>
      {value}
    </p>
    {note && (
      <p
        className={`mt-0.5 truncate text-technical-data ${
          tone === 'good' ? 'text-secondary' : tone === 'bad' ? 'text-error' : tone === 'warn' ? 'text-[#B7791F]' : 'text-on-surface-variant'
        }`}
      >
        {note}
      </p>
    )}
  </div>
);

const Card = ({title, action, children}: {title: string; action?: ReactNode; children: ReactNode}) => (
  <section className="panel min-w-0 p-4 md:p-5">
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-ivory-300 pb-1.5">
      <h2 className="text-label-caps uppercase text-burgundy">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Empty = ({children}: {children: ReactNode}) => (
  <p className="py-8 text-center text-body-sm text-on-surface-variant">{children}</p>
);

const TipBox = ({active, payload, label}: {active?: boolean; payload?: any[]; label?: string}) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((t, p) => t + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-ivory-300 bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-espresso">{label && /^\d{4}-/.test(label) ? shortDate(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-on-surface-variant">
          <span className="inline-block h-2 w-2 rounded-full" style={{background: p.color}} />
          {p.name}: <span className="font-semibold text-espresso">{inr(p.value)}</span>
        </p>
      ))}
      {payload.length > 1 && <p className="mt-1 border-t border-ivory-200 pt-1 font-semibold text-espresso">Total: {inr(total)}</p>}
    </div>
  );
};

/** Ranked list with an inline magnitude bar (single hue) */
const RankList = ({rows}: {rows: {name: string; value: number; sub?: string}[]}) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.name + i} className="text-body-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-espresso">
              <span className="mr-1.5 text-outline">{i + 1}.</span>
              {r.name}
            </span>
            <span className="shrink-0 font-semibold text-espresso">{inr(r.value)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-ivory-200">
              <div className="h-1.5 rounded-full" style={{width: `${(r.value / max) * 100}%`, background: SERIES.counter}} />
            </div>
            {r.sub && <span className="shrink-0 text-technical-data text-outline">{r.sub}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
};

const TrendChart = ({data, showOnline}: {data: Analytics['trend']; showOnline: boolean}) => {
  // Daily sales are sparse; past a month fold days into weeks so bars stay readable
  const rows =
    data.length > 31
      ? data.reduce<Analytics['trend']>((acc, d, i) => {
          if (i % 7 === 0) acc.push({...d});
          else {
            acc[acc.length - 1].counter += d.counter;
            acc[acc.length - 1].online += d.online;
          }
          return acc;
        }, [])
      : data;
  const weekly = data.length > 31;
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-on-surface-variant" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{background: SERIES.counter}} /> Showroom (POS)
        </span>
        {showOnline && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{background: SERIES.online}} /> Online store
          </span>
        )}
        <span className="ml-auto text-outline">{weekly ? 'Per week' : 'Per day'}</span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{top: 8, right: 8, left: 0, bottom: 0}} barCategoryGap="22%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{fill: AXIS, fontSize: 11}}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis tickFormatter={axisInr} tick={{fill: AXIS, fontSize: 11}} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<TipBox />} cursor={{fill: 'rgba(138,129,122,0.08)'}} />
            <Bar dataKey="counter" name="Showroom" stackId="s" fill={SERIES.counter} maxBarSize={28} stroke="#fff" strokeWidth={showOnline ? 1 : 0} />
            {showOnline && (
              <Bar dataKey="online" name="Online" stackId="s" fill={SERIES.online} radius={[4, 4, 0, 0]} maxBarSize={28} stroke="#fff" strokeWidth={1} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

const BranchChart = ({data}: {data: Analytics['branches']}) => (
  <div className="w-full" style={{height: Math.max(data.length * 44, 120)}}>
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{top: 0, right: 16, left: 0, bottom: 0}} barCategoryGap={10}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={axisInr} tick={{fill: AXIS, fontSize: 11}} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={{fill: AXIS, fontSize: 12}} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<TipBox />} cursor={{fill: 'rgba(138,129,122,0.08)'}} />
        <Bar dataKey="sales" name="Sales" fill={SERIES.counter} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

type Props = {
  panel: AnalyticsPanel;
  /** Show the branch comparison (company / platform view) */
  multiBranch?: boolean;
  /** Extra tiles rendered after the KPI row */
  children?: ReactNode;
};

const AnalyticsBoard = ({panel, multiBranch = false, children}: Props) => {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const {data, isPending, isError, isFetching} = useAnalytics(panel, days);
  const k = data?.kpis;
  const change = k?.salesChangePct;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-on-surface-variant">
          {data ? `${shortDate(data.period.from)} – ${shortDate(data.period.to)}` : 'Business performance'}
          {isFetching && <Loader2 size={13} className="ml-2 inline animate-spin" />}
        </p>
        <div role="group" aria-label="Period" className="inline-flex rounded-lg border border-ivory-300 bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`min-h-[34px] rounded-md px-3 text-xs font-semibold transition-colors ${
                days === r.days ? 'bg-burgundy text-white' : 'text-on-surface-variant hover:bg-ivory-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <p role="alert" className="text-body-sm text-error">
          Business figures could not be loaded.
        </p>
      )}

      {isPending ? (
        <div className="flex items-center gap-2 py-12 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading figures…
        </div>
      ) : (
        k &&
        data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
              <Tile
                label="Sales"
                value={inrShort(Math.round(k.sales))}
                tone={change == null ? undefined : change >= 0 ? 'good' : 'bad'}
                note={
                  change == null ? (
                    `${k.bills} bills · ${k.orders} orders`
                  ) : (
                    <>
                      {change >= 0 ? <ArrowUpRight size={12} className="inline" /> : <ArrowDownRight size={12} className="inline" />}{' '}
                      {Math.abs(change)}% vs previous {days} days
                    </>
                  )
                }
              />
              <Tile label="Gross Profit" value={inrShort(Math.round(k.grossProfit))} note={`${k.marginPct}% margin, before expenses`} />
              <Tile label="Purchases" value={inrShort(Math.round(k.purchases))} note={`${k.purchaseBills} purchase bills`} />
              <Tile label="Avg. Bill Value" value={inrShort(Math.round(k.avgBill))} note={`${k.bills} showroom bills`} />
              <Tile
                label="Customer Dues"
                value={inrShort(Math.round(k.customerDues))}
                tone={k.customerDues > 0 ? 'warn' : undefined}
                note={`${k.customersOwing} customers owe`}
              />
              <Tile label="Supplier Payable" value={inrShort(Math.round(k.supplierPayable))} note="Unpaid purchase bills" />
              <Tile
                label="Open Quotations"
                value={String(k.openQuotations)}
                note={`${inrShort(Math.round(k.openQuotationValue))} in the pipeline`}
              />
              <Tile
                label="Low Stock"
                value={String(k.lowStock)}
                tone={k.lowStock > 0 ? 'bad' : 'good'}
                note={
                  k.lowStock > 0 ? (
                    <>
                      <AlertTriangle size={12} className="inline" /> items at or below reorder level
                    </>
                  ) : (
                    'All items above reorder level'
                  )
                }
              />
              {children}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <Card title="Revenue trend">
                  {k.sales > 0 ? (
                    <TrendChart data={data.trend} showOnline={k.onlineSales > 0} />
                  ) : (
                    <Empty>No sales in this period yet.</Empty>
                  )}
                </Card>
              </div>
              <Card title="Sales mix">
                <dl className="space-y-3 text-body-sm">
                  {[
                    {label: 'Showroom (POS)', value: k.counterSales, color: SERIES.counter},
                    {label: 'Online store', value: k.onlineSales, color: SERIES.online},
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between">
                        <dt className="flex items-center gap-2 text-on-surface-variant">
                          <span className="inline-block h-2 w-2 rounded-full" style={{background: m.color}} />
                          {m.label}
                        </dt>
                        <dd className="font-semibold text-espresso">{inr(m.value)}</dd>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-ivory-200">
                        <div className="h-1.5 rounded-full" style={{width: `${k.sales ? (m.value / k.sales) * 100 : 0}%`, background: m.color}} />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-ivory-200 pt-3">
                    <dt className="text-on-surface-variant">of which wholesale</dt>
                    <dd className="font-semibold text-espresso">{inr(k.wholesaleSales)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-on-surface-variant">Online orders pending</dt>
                    <dd className="font-semibold text-espresso">{k.pendingOrders}</dd>
                  </div>
                </dl>
                {data.pendingOrdersByStatus.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {data.pendingOrdersByStatus.map((s) => (
                      <li key={s.status} className="rounded-full bg-ivory-200 px-2.5 py-1 text-xs text-on-surface-variant">
                        {pretty(s.status)}: <span className="font-semibold text-espresso">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className={`grid gap-4 lg:grid-cols-2`}>
              {multiBranch && (
                <Card title="Branch comparison">
                  {data.branches.length ? <BranchChart data={data.branches.slice(0, 10)} /> : <Empty>No branches yet.</Empty>}
                </Card>
              )}
              <Card title="Sales by category">
                {data.categories.length ? (
                  <RankList rows={data.categories.slice(0, 8).map((c) => ({name: c.name, value: c.revenue}))} />
                ) : (
                  <Empty>No sales in this period yet.</Empty>
                )}
              </Card>
              <Card title="Top products">
                {data.topProducts.length ? (
                  <RankList rows={data.topProducts.map((p) => ({name: p.name, value: p.revenue, sub: `${p.qty} sold`}))} />
                ) : (
                  <Empty>No sales in this period yet.</Empty>
                )}
              </Card>
              <Card title="Top salespeople">
                {data.salespeople.length ? (
                  <RankList rows={data.salespeople.map((s) => ({name: s.name, value: s.sales, sub: `${s.bills} bills`}))} />
                ) : (
                  <Empty>Pick a salesperson on POS bills to see who sells most.</Empty>
                )}
              </Card>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default AnalyticsBoard;
