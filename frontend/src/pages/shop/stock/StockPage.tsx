import {useSetRack} from '@/lib/react-query/queriesAndMutations/manufacturing';
import type {StockKind, StockLine} from '@/types/stock';
import React, {useState, useEffect, useMemo} from 'react';
import {useNavigate} from '@tanstack/react-router';
import toast from 'react-hot-toast';
import {format, parseISO} from 'date-fns';
import {
  useStockSummary,
  useAdjustStock,
  usePhysicalStockCount,
} from '@/lib/react-query/queriesAndMutations/stock';
import {
  StockPeriod,
  StockTab,
  StockItemRow,
  AdjustStockPayload,
  PhysicalStockCountItem,
} from '@/types/stock';
import {
  Search,
  Plus,
  SlidersHorizontal,
  ClipboardCheck,
  ChevronDown,
  X,
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  ArrowUpDown,
  Barcode,
} from 'lucide-react';

interface StockPageProps {
  panel?: 'shop-admin' | 'branch-admin';
}

const PERIOD_OPTIONS: {id: StockPeriod; label: string}[] = [
  {id: 'this-month', label: 'This month'},
  {id: 'today', label: 'Today'},
  {id: 'this-week', label: 'This week'},
  {id: 'last-30-days', label: 'Last 30 days'},
  {id: 'all-time', label: 'All time'},
];

const ADJUST_REASONS = [
  'Damage in transit/handling',
  'Display piece shrinkage',
  'Physical audit variance',
  'Supplier return rejected',
  'Promotion/Sample gift',
  'Customer exchange adjustment',
  'Other',
];

export default function StockPage({panel = 'shop-admin'}: StockPageProps) {

  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState<StockTab>('STOCK_SUMMARY');
  const [selectedPeriod, setSelectedPeriod] = useState<StockPeriod>('this-month');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<StockKind | undefined>();
  const [line, setLine] = useState<StockLine | undefined>();
  const [rackEdit, setRackEdit] = useState<{variantId: string; value: string} | null>(null);
  const setRack = useSetRack();
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);

  // Modals
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);

  // Stock Adjustment Form State
  const [adjustPayload, setAdjustPayload] = useState<AdjustStockPayload>({
    variantId: '',
    type: 'DECREASE',
    quantity: 1,
    reason: 'Damage in transit/handling',
    notes: '',
  });

  // Physical Audit State
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [auditNotes, setAuditNotes] = useState('');

  // Query
  const {data, isLoading, isFetching} = useStockSummary(panel, {
    period: selectedPeriod,
    tab: activeTab,
    search,
    kind,
    line,
  });

  // Mutations
  const adjustMutation = useAdjustStock(panel);
  const auditMutation = usePhysicalStockCount(panel);

  const metrics = data?.metrics;
  const counts = data?.counts;
  const items: StockItemRow[] = data?.items || [];

  // The selected period with the dates the server counted, e.g. "This month (1 Nov – 12 Nov)"
  const periodName = PERIOD_OPTIONS.find((p) => p.id === selectedPeriod)?.label;
  const range = data?.period;
  const periodLabel = !range?.from
    ? periodName
    : range.from === range.to
      ? `${periodName} (${format(parseISO(range.to), 'd MMM')})`
      : `${periodName} (${format(parseISO(range.from), 'd MMM')} – ${format(parseISO(range.to), 'd MMM')})`;
  const pcs = (n?: number) =>
    n === undefined ? '—' : `${n.toLocaleString('en-IN')} pcs`;

  // When clicking Adjust on a specific row
  const openAdjustForRow = (item: StockItemRow) => {
    setAdjustPayload({
      variantId: item.variantId,
      type: 'DECREASE',
      quantity: 1,
      reason: 'Display piece shrinkage',
      notes: '',
    });
    setAdjustModalOpen(true);
  };

  // Open Physical Stock Count Modal with current items
  const openAuditModal = () => {
    const initialMap: Record<string, number> = {};
    items.forEach((it) => {
      initialMap[it.variantId] = it.closing;
    });
    setAuditCounts(initialMap);
    setAuditNotes('');
    setAuditModalOpen(true);
  };

  // Submit Stock Adjustment
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustPayload.variantId) {
      toast.error('Please select an item');
      return;
    }
    if (adjustPayload.quantity <= 0) {
      toast.error('Quantity must be at least 1');
      return;
    }

    try {
      await adjustMutation.mutateAsync(adjustPayload);
      toast.success('Stock adjusted successfully');
      setAdjustModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to adjust stock');
    }
  };

  // Submit Physical Audit
  const handleAuditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payloadItems: PhysicalStockCountItem[] = items.map((it) => ({
      variantId: it.variantId,
      systemQty: it.closing,
      countedQty: auditCounts[it.variantId] !== undefined ? auditCounts[it.variantId] : it.closing,
      reason: 'Physical stock reconciliation',
    }));

    try {
      await auditMutation.mutateAsync({
        notes: auditNotes,
        items: payloadItems,
      });
      toast.success('Physical stock count reconciled successfully');
      setAuditModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to record audit');
    }
  };

  // Format INR helper
  const formatInr = (n?: number | null) => {
    if (n === null || n === undefined) return '—';
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-5 font-sans text-stone-800">
      {/* Top Breadcrumb & Actions Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-widest text-stone-400 uppercase mb-1">
            PRODUCTS & STOCK
          </div>
          <h1 className="text-3xl font-serif font-bold text-[#3F271B] tracking-tight">
            Stock
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Live stock of every product and variant, with every movement from purchase, production, sale, return, transfer and adjustment.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={openAuditModal}
            className="flex items-center gap-2 rounded-md border border-[#5B3A29] bg-white px-4 py-2 text-sm font-semibold text-[#5B3A29] shadow-sm hover:bg-stone-50 transition-colors"
          >
            <ClipboardCheck size={14} />
            Physical Stock Count
          </button>

          <button
            onClick={() => setAdjustModalOpen(true)}
            className="flex items-center gap-2 rounded-md border border-[#5B3A29] bg-white px-4 py-2 text-sm font-semibold text-[#5B3A29] shadow-sm hover:bg-stone-50 transition-colors"
          >
            <SlidersHorizontal size={14} />
            Adjust
          </button>

          <button
            onClick={() => navigate({to: '/shop-admin/purchase-bills'})}
            className="flex items-center gap-2 rounded-md bg-[#5B3A29] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F271B] transition-colors"
          >
            <Plus size={15} />
            Purchase
          </button>
        </div>
      </div>

      {/* 5 Metric KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {/* Card 1: SELLABLE STOCK */}
        <div className="rounded-lg border border-stone-200/90 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            SELLABLE STOCK
          </div>
          <div className="mt-2 text-2xl font-serif font-bold text-stone-900 tracking-tight">
            {pcs(metrics?.sellablePcs)}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {metrics ? `${metrics.sellableItemSizes} variants` : '—'}
          </div>
        </div>

        {/* Card 2: VALUE AT COST */}
        <div className="rounded-lg border border-stone-200/90 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            VALUE AT COST
          </div>
          <div className="mt-2 text-2xl font-serif font-bold text-stone-900 tracking-tight">
            {/* No purchase bill yet means no cost: show "—", not a guess */}
            {metrics && (metrics.costValue || !metrics.withoutCost)
              ? formatInr(metrics.costValue)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {metrics ? `At MRP ${formatInr(metrics.mrpValue)}` : '—'}
            {!!metrics?.withoutCost &&
              ` · ${metrics.withoutCost} variants without cost`}
          </div>
        </div>

        {/* Card 3: DAMAGED */}
        <div className="rounded-lg border border-stone-200/90 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            DAMAGED
          </div>
          <div className="mt-2 text-2xl font-serif font-bold text-stone-900 tracking-tight">
            {pcs(metrics?.damagedPcs)}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {metrics ? `${metrics.damagedItemSizes} variants` : '—'}
          </div>
        </div>

        {/* Card 4: LOW / OUT */}
        <div className="rounded-lg border border-stone-200/90 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            LOW / OUT
          </div>
          <div className="mt-2 text-2xl font-serif font-bold text-stone-900 tracking-tight">
            {metrics ? `${metrics.lowCount} / ${metrics.outCount}` : '—'}
          </div>
          <div className="mt-1 text-xs text-stone-500">Reorder</div>
        </div>

        {/* Card 5: SLOW MOVERS */}
        <div className="rounded-lg border border-stone-200/90 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            SLOW MOVERS
          </div>
          <div className="mt-2 text-2xl font-serif font-bold text-stone-900 tracking-tight">
            {metrics?.slowCount ?? '—'}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {metrics ? `No sale in ${metrics.slowDays} days` : '—'}
          </div>
        </div>
      </div>

      {/* What to look at: finished goods / raw material / hardware, and the business line */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap rounded-lg border border-stone-200 bg-white p-0.5" role="group" aria-label="Stock type">
          {([
            [undefined, 'All stock'],
            ['FINISHED_GOOD', 'Finished goods'],
            ['RAW_MATERIAL', 'Raw material'],
            ['HARDWARE', 'Hardware'],
          ] as const).map(([k, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-[34px] rounded-md px-3 text-sm font-semibold transition-colors ${kind === k ? 'bg-[#5B3A29] text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={line ?? ''}
          onChange={(e) => setLine((e.target.value || undefined) as StockLine | undefined)}
          className="min-h-[36px] rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
          aria-label="Business line"
        >
          <option value="">All business lines</option>
          <option value="FURNITURE">Furniture</option>
          <option value="ELECTRONICS">Electronics</option>
          <option value="CROCKERY">Crockery & utensils</option>
        </select>
      </div>

      {/* Main Stock Table Container */}
      <div className="rounded-xl border border-stone-200/90 bg-white shadow-sm overflow-hidden">
        {/* Tabs & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-stone-200 px-5 py-3 gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('STOCK_SUMMARY')}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap ${
                activeTab === 'STOCK_SUMMARY'
                  ? 'text-[#5B3A29] border-b-2 border-[#5B3A29] font-bold'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Stock Summary
            </button>

            <button
              onClick={() => setActiveTab('LOW_OUT')}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'LOW_OUT'
                  ? 'text-[#5B3A29] border-b-2 border-[#5B3A29] font-bold'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <span>Low / Out</span>
              <span className="inline-flex items-center justify-center rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                {counts?.lowOut ?? '—'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('DAMAGED')}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap ${
                activeTab === 'DAMAGED'
                  ? 'text-[#5B3A29] border-b-2 border-[#5B3A29] font-bold'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Damaged
            </button>

            <button
              onClick={() => setActiveTab('SLOW_MOVING')}
              className={`pb-2 text-xs font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap ${
                activeTab === 'SLOW_MOVING'
                  ? 'text-[#5B3A29] border-b-2 border-[#5B3A29] font-bold'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Slow Moving
            </button>
          </div>

          {/* Right Controls: Period Dropdown & Search Input */}
          <div className="flex items-center gap-3">
            {/* Period Dropdown */}
            <div className="relative">
              <button
                onClick={() => setPeriodDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-md border border-stone-200/90 bg-[#FAF9F6] px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <span>{periodLabel}</span>
                <ChevronDown size={14} className="text-stone-400" />
              </button>

              {periodDropdownOpen && (
                <div className="absolute right-0 mt-1 z-30 w-48 rounded-md border border-stone-200 bg-white py-1 shadow-lg">
                  {PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSelectedPeriod(opt.id);
                        setPeriodDropdownOpen(false);
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        selectedPeriod === opt.id
                          ? 'bg-[#5B3A29]/10 text-[#5B3A29] font-semibold'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-48 sm:w-60">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                placeholder="Item, barcode or rack"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-stone-200/90 bg-[#FAF9F6] pl-8 pr-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:border-[#5B3A29] focus:bg-white focus:outline-none transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Stock Movement Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-[#FAF9F6] text-[10px] font-bold uppercase tracking-wider text-stone-500">
                <th className="px-5 py-3.5">ITEM / VARIANT</th>
                <th className="px-3 py-3.5">RACK</th>
                <th className="px-3 py-3.5 text-center">OPENING</th>
                <th className="px-3 py-3.5 text-center">+ PURCHASE</th>
                <th className="px-3 py-3.5 text-center">- SOLD</th>
                <th className="px-3 py-3.5 text-center">+ SALES RETURN</th>
                <th className="px-3 py-3.5 text-center">± TRANSFER</th>
                <th className="px-3 py-3.5 text-center">± ADJUST</th>
                <th className="px-3 py-3.5 text-center">± PRODUCTION</th>
                <th className="px-3 py-3.5 text-center font-bold text-stone-700">CLOSING</th>
                <th className="px-5 py-3.5 text-right">VALUE (COST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-stone-400">
                    Loading live stock movements...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-stone-400">
                    No items found for the selected tab and filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openAdjustForRow(row)}
                    className="hover:bg-stone-50/80 transition-colors cursor-pointer group"
                  >
                    {/* Item / Size & Barcode */}
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-stone-900 group-hover:text-[#5B3A29] transition-colors">
                        {row.productName}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono tracking-tight mt-0.5">
                        {row.variantName} · {row.barcode}
                      </div>
                      {row.kind && row.kind !== 'FINISHED_GOOD' && (
                        <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                          {row.kind === 'RAW_MATERIAL' ? 'Raw material' : 'Hardware'}
                          {row.unit ? ` · ${row.unit}` : ''}
                        </span>
                      )}
                    </td>

                    {/* Rack: click to edit */}
                    <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {rackEdit?.variantId === row.variantId ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            setRack.mutate({variantId: row.variantId, rackNo: rackEdit.value.trim()}, {onSuccess: () => setRackEdit(null)});
                          }}
                        >
                          <input
                            autoFocus
                            value={rackEdit.value}
                            maxLength={40}
                            onChange={(e) => setRackEdit({...rackEdit, value: e.target.value.toUpperCase()})}
                            onKeyDown={(e) => e.key === 'Escape' && setRackEdit(null)}
                            className="w-20 rounded border border-stone-300 px-1.5 py-1 font-mono text-xs"
                            aria-label="Rack"
                          />
                          <button type="submit" className="rounded bg-[#5B3A29] px-1.5 py-1 text-[10px] font-semibold text-white" disabled={setRack.isPending}>
                            Save
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRackEdit({variantId: row.variantId, value: row.rackNo ?? ''})}
                          className="whitespace-nowrap rounded border border-dashed border-transparent px-1.5 py-0.5 font-mono text-xs text-stone-700 hover:border-stone-300"
                          title="Change rack"
                        >
                          {row.rackNo || <span className="text-stone-300">Set</span>}
                        </button>
                      )}
                    </td>

                    {/* Opening */}
                    <td className="px-3 py-3.5 text-center font-mono text-stone-600">
                      {row.opening}
                    </td>

                    {/* + Purchase */}
                    <td className="px-3 py-3.5 text-center font-mono font-medium">
                      {row.purchase > 0 ? (
                        <span className="text-emerald-700 font-semibold">
                          +{row.purchase}
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    {/* - Sold */}
                    <td className="px-3 py-3.5 text-center font-mono font-medium">
                      {row.sold > 0 ? (
                        <span className="text-rose-700 font-semibold">
                          -{row.sold}
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    {/* + Sales Return */}
                    <td className="px-3 py-3.5 text-center font-mono font-medium">
                      {row.salesReturn > 0 ? (
                        <span className="text-emerald-700 font-semibold">
                          +{row.salesReturn}
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    {/* ± Transfer */}
                    <td className="px-3 py-3.5 text-center font-mono text-stone-700 font-medium">
                      {row.transfer !== 0 ? (
                        <span>{row.transfer > 0 ? `+${row.transfer}` : row.transfer}</span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    {/* ± Adjust */}
                    <td className="px-3 py-3.5 text-center font-mono text-stone-700 font-medium">
                      {row.adjust !== 0 ? (
                        <span>{row.adjust > 0 ? `+${row.adjust}` : row.adjust}</span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    {/* ± Production (work orders) */}
                    <td className="px-3 py-3.5 text-center font-mono text-stone-700 font-medium">
                      {row.production ? (
                        <span className={row.production > 0 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                          {row.production > 0 ? `+${row.production}` : row.production}
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>

                    {/* Closing */}
                    <td className="px-3 py-3.5 text-center font-mono font-bold text-stone-900">
                      {row.closing === 0 ? (
                        <span className="text-rose-600 font-bold">0</span>
                      ) : row.closing <= row.threshold ? (
                        <span className="text-amber-700 font-bold">{row.closing}</span>
                      ) : (
                        row.closing
                      )}
                    </td>

                    {/* Value (Cost) */}
                    <td className="px-5 py-3.5 text-right font-mono text-stone-700 font-medium">
                      {formatInr(row.valueCost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#3F271B]">
                  Adjust Stock
                </h3>
                <p className="text-xs text-stone-500">
                  Update inventory count or record loss/damage for a variant.
                </p>
              </div>
              <button
                onClick={() => setAdjustModalOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
              {/* Variant Selector */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Item / Variant *
                </label>
                <select
                  value={adjustPayload.variantId}
                  onChange={(e) =>
                    setAdjustPayload((prev) => ({...prev, variantId: e.target.value}))
                  }
                  className="w-full rounded-md border border-stone-200 px-3 py-2 text-xs focus:border-[#5B3A29] focus:outline-none"
                  required
                >
                  <option value="">Select variant</option>
                  {items.map((it) => (
                    <option key={it.variantId} value={it.variantId}>
                      {it.productName} ({it.variantName}) · On hand: {it.closing}
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Adjustment Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['INCREASE', 'DECREASE', 'CORRECTION', 'DAMAGE'] as const).map(
                    (type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() =>
                          setAdjustPayload((prev) => ({...prev, type}))
                        }
                        className={`rounded-md border py-2 text-center font-medium transition-all ${
                          adjustPayload.type === type
                            ? 'border-[#5B3A29] bg-[#5B3A29] text-white font-semibold'
                            : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {type === 'INCREASE' && '+ Increase'}
                        {type === 'DECREASE' && '- Decrease'}
                        {type === 'CORRECTION' && '= Set Exact'}
                        {type === 'DAMAGE' && '⚠ Flag Damage'}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  {adjustPayload.type === 'CORRECTION'
                    ? 'New Physical Count *'
                    : 'Adjustment Quantity *'}
                </label>
                <input
                  type="number"
                  min={adjustPayload.type === 'CORRECTION' ? 0 : 1}
                  value={adjustPayload.quantity}
                  onChange={(e) =>
                    setAdjustPayload((prev) => ({
                      ...prev,
                      quantity: parseInt(e.target.value || '0', 10),
                    }))
                  }
                  className="w-full rounded-md border border-stone-200 px-3 py-2 text-xs font-mono focus:border-[#5B3A29] focus:outline-none"
                  required
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Reason *
                </label>
                <select
                  value={adjustPayload.reason}
                  onChange={(e) =>
                    setAdjustPayload((prev) => ({...prev, reason: e.target.value}))
                  }
                  className="w-full rounded-md border border-stone-200 px-3 py-2 text-xs focus:border-[#5B3A29] focus:outline-none"
                  required
                >
                  {ADJUST_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={adjustPayload.notes}
                  onChange={(e) =>
                    setAdjustPayload((prev) => ({...prev, notes: e.target.value}))
                  }
                  placeholder="Additional context or rack/bin details..."
                  className="w-full rounded-md border border-stone-200 px-3 py-2 text-xs focus:border-[#5B3A29] focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="rounded-md border border-stone-200 px-4 py-2 font-medium text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustMutation.isPending}
                  className="rounded-md bg-[#5B3A29] px-5 py-2 font-semibold text-white hover:bg-[#3F271B] disabled:opacity-50"
                >
                  {adjustMutation.isPending ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Physical Stock Count Modal */}
      {auditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#3F271B]">
                  Physical Stock Count (Audit)
                </h3>
                <p className="text-xs text-stone-500">
                  Verify actual counted inventory on the branch floor. Variances will be automatically reconciled.
                </p>
              </div>
              <button
                onClick={() => setAuditModalOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAuditSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
              <div className="flex-1 overflow-y-auto mb-4 border border-stone-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500 border-b border-stone-200 sticky top-0">
                      <th className="px-4 py-2.5">Item & Variant</th>
                      <th className="px-3 py-2.5 text-center">System Stock</th>
                      <th className="px-4 py-2.5 text-center w-32">Physical Counted</th>
                      <th className="px-3 py-2.5 text-center">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono">
                    {items.map((it) => {
                      const counted = auditCounts[it.variantId] !== undefined ? auditCounts[it.variantId] : it.closing;
                      const variance = counted - it.closing;
                      return (
                        <tr key={it.variantId} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2 font-sans font-medium text-stone-900">
                            {it.productName} ({it.variantName})
                            <div className="text-[10px] text-stone-400 font-mono">
                              {it.barcode}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-stone-600">
                            {it.closing}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              value={counted}
                              onChange={(e) => {
                                const val = parseInt(e.target.value || '0', 10);
                                setAuditCounts((prev) => ({
                                  ...prev,
                                  [it.variantId]: isNaN(val) ? 0 : val,
                                }));
                              }}
                              className="w-24 rounded border border-stone-200 px-2 py-1 text-center font-bold text-stone-900 focus:border-[#5B3A29] focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-2 text-center font-bold">
                            {variance === 0 ? (
                              <span className="text-stone-300">0</span>
                            ) : variance > 0 ? (
                              <span className="text-emerald-700">+{variance}</span>
                            ) : (
                              <span className="text-rose-700">{variance}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block font-semibold text-stone-700 mb-1">
                  Audit Notes (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Month-end floor count"
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="w-full rounded-md border border-stone-200 px-3 py-2 text-xs focus:border-[#5B3A29] focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setAuditModalOpen(false)}
                  className="rounded-md border border-stone-200 px-4 py-2 font-medium text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={auditMutation.isPending}
                  className="rounded-md bg-[#5B3A29] px-5 py-2 font-semibold text-white hover:bg-[#3F271B] disabled:opacity-50"
                >
                  {auditMutation.isPending ? 'Reconciling...' : 'Reconcile & Save Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

