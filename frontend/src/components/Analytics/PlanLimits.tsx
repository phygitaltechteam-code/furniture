import {usePlanLimits} from '@/lib/react-query/queriesAndMutations/analytics';
import {LimitRow} from '@/types/analytics';
import {Check, X} from 'lucide-react';

const Meter = ({label, row}: {label: string; row: LimitRow}) => {
  const pct = row.limit ? Math.min((row.used / row.limit) * 100, 100) : 100;
  const full = row.used >= row.limit;
  const near = !full && pct >= 80;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-body-sm">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-semibold text-espresso">
          {row.used} / {row.limit}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 rounded-full bg-ivory-200"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={row.limit}
        aria-valuenow={row.used}
      >
        <div
          className={`h-2 rounded-full ${full ? 'bg-error' : near ? 'bg-[#B7791F]' : 'bg-burgundy'}`}
          style={{width: `${pct}%`}}
        />
      </div>
      <p className={`mt-1 text-technical-data ${full ? 'text-error' : 'text-outline'}`}>
        {full ? 'Limit reached — ask your provider to raise it' : `${row.left} more allowed`}
      </p>
    </div>
  );
};

const Flag = ({on, label}: {on: boolean; label: string}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
      on ? 'bg-secondary-container text-on-secondary-container' : 'bg-ivory-200 text-on-surface-variant'
    }`}
  >
    {on ? <Check size={13} /> : <X size={13} />} {label}
  </span>
);

/** Plan usage of the admin's company, against the limits the super admin set */
const PlanLimits = () => {
  const {data} = usePlanLimits();
  if (!data) return null;
  return (
    <section className="panel p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-ivory-300 pb-1.5">
        <h2 className="text-label-caps uppercase text-burgundy">Your plan</h2>
        <div className="flex flex-wrap gap-1.5">
          <Flag on={data.ecommerceEnabled} label="Online store" />
          <Flag on={data.manufacturingEnabled} label="Manufacturing" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Meter label="Branches" row={data.branches} />
        <Meter label="Employees" row={data.employees} />
        <Meter label="Products" row={data.products} />
      </div>
    </section>
  );
};

export default PlanLimits;
