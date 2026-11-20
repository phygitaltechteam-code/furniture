import {useState} from 'react';
import {useBranchPnlReport} from '@/lib/react-query/queriesAndMutations/branchExtras';
import type {ReportPanel} from '@/lib/api/branchExtras';
import {Download} from 'lucide-react';

const serif = {fontFamily: "'Playfair Display', Georgia, serif"};
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const monthStart = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

const inr = (n: number) =>
  `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', {maximumFractionDigits: 0})}`;

const dateInput =
  'rounded border border-[#ded5ce] bg-white px-3 py-1.5 text-xs text-[#1F1D1B] focus:outline-none focus:ring-1 focus:ring-[#5B3A29]';

/** Profit & loss for a date range: every shop of the branch, or one shop's own */
export default function BranchReportsPage({panel = 'branch-admin'}: {panel?: ReportPanel}) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(ymd(new Date()));
  const valid = !!from && !!to && to >= from;
  const {data, isLoading, isError} = useBranchPnlReport(panel, valid ? from : undefined, valid ? to : undefined);

  const shops = data?.shops ?? [];
  const rows = data?.rows ?? [];

  const exportCsv = () => {
    if (!data) return;
    const head = ['Line', ...shops.map((s) => s.name), 'Branch', 'Total'];
    const lines = rows.map((r) =>
      [r.line, ...shops.map((s) => r.byShop[s.id] ?? 0), r.branch, r.total].map((v) => `"${v}"`).join(','),
    );
    const blob = new Blob([[head.map((h) => `"${h}"`).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `branch_pnl_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5 text-[#1F1D1B]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#7A6E66]">
            Reports
          </div>
          <h1 className="font-serif text-3xl tracking-tight text-[#1F1D1B]" style={serif}>
            {panel === 'shop-admin' ? 'Profit & loss' : 'Profit & loss by branch'}
          </h1>
          <p className="mt-1 text-sm text-[#5F5A55]">
            Sales without GST, less returns, cost of goods at average purchase cost, and expenses.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="inline-flex items-center gap-1.5 self-start rounded border border-[#5B3A29] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#5B3A29] transition hover:bg-[#5B3A29]/5 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
        </label>
        <label className="flex items-center gap-2">
          To
          <input
            type="date"
            value={to}
            min={from}
            max={ymd(new Date())}
            onChange={(e) => setTo(e.target.value)}
            className={dateInput}
          />
        </label>
        {!valid && <span className="text-red-700">"To" must be on or after "From".</span>}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#efe9e3] bg-white shadow-sm">
        <h2 className="border-b border-[#f2ede7] px-5 py-3 font-serif text-base font-semibold text-[#1F1D1B]" style={serif}>
          {data?.period ?? 'Profit & loss'}
        </h2>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-[#5F5A55]">Loading…</p>
        ) : isError ? (
          <p className="px-5 py-10 text-center text-sm text-red-700">Could not load the report.</p>
        ) : !shops.length ? (
          <p className="px-5 py-10 text-center text-sm text-[#5F5A55]">This branch has no branches yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#f0eae3] bg-[#faf7f4] text-[10px] font-semibold uppercase tracking-wider text-[#7A6E66]">
                  <th className="px-4 py-3"></th>
                  {shops.map((s) => (
                    <th key={s.id} className="whitespace-nowrap px-4 py-3 text-right">
                      {s.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Branch</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f7f2ed]">
                {rows.map((r) => {
                  const strong = r.line.startsWith('Gross') || r.line.startsWith('Net profit');
                  return (
                    <tr key={r.line} className={strong ? 'bg-[#fdfbf9] font-semibold' : ''}>
                      <td className="whitespace-nowrap px-4 py-3 text-[#1F1D1B]">{r.line}</td>
                      {shops.map((s) => {
                        const v = r.byShop[s.id] ?? 0;
                        return (
                          <td key={s.id} className={`px-4 py-3 text-right font-mono ${v < 0 ? 'text-red-700' : ''}`}>
                            {v ? inr(v) : '—'}
                          </td>
                        );
                      })}
                      <td className={`px-4 py-3 text-right font-mono ${r.branch < 0 ? 'text-red-700' : ''}`}>
                        {r.branch ? inr(r.branch) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${r.total < 0 ? 'text-red-700' : ''}`}>
                        {inr(r.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!!data?.margins.length && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.margins.map((m) => (
            <div key={m.shop} className="rounded-lg border border-[#efe9e3] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A6E66]">{m.shop}</p>
              <p className="mt-1 font-serif text-xl text-[#1F1D1B]" style={serif}>
                {m.margin === null ? '—' : `${m.margin}%`}
              </p>
              <p className="text-[11px] text-[#5F5A55]">gross margin</p>
            </div>
          ))}
        </div>
      )}

      {data?.note && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{data.note}</p>
      )}
    </div>
  );
}
