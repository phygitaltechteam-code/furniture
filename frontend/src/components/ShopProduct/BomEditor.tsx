import {useBom, useSaveBom, useWorkOrderOptions} from '@/lib/react-query/queriesAndMutations/manufacturing';
import {getErrorMessage} from '@/utils/axios';
import {inr} from '@/utils/money';
import {Link} from '@tanstack/react-router';
import {Loader2, Plus, Save, Trash2} from 'lucide-react';
import {useEffect, useState} from 'react';

type Line = {materialVariantId: string; quantity: string; wastagePct: string; notes: string};
const cell = 'field-input min-h-[38px] px-2.5 py-1.5 text-sm aria-[invalid=true]:border-error';

/**
 * Bill of materials of a workshop-made product: raw material per finished
 * piece (+ wastage). Work orders copy it × quantity when they are created.
 */
const BomEditor = ({productId}: {productId: string}) => {
  const {data: bom, isPending, isError, error} = useBom(productId);
  const {data: options} = useWorkOrderOptions();
  const save = useSaveBom();
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (bom) {
      setLines(bom.bomLines.map((l) => ({materialVariantId: l.materialVariantId, quantity: String(l.quantity), wastagePct: String(l.wastagePct), notes: l.notes ?? ''})));
      setDirty(false);
    }
  }, [bom]);

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 size={14} className="animate-spin" /> Loading bill of materials…
      </p>
    );
  }
  if (isError) return <p className="text-sm text-on-surface-variant">{getErrorMessage(error, 'Manufacturing is not enabled for your plan.')}</p>;

  const raw = options?.raw ?? [];
  const update = (i: number, patch: Partial<Line>) => {
    setLines(lines.map((l, j) => (j === i ? {...l, ...patch} : l)));
    setDirty(true);
  };
  const cost = lines.reduce((t, l) => {
    const r = raw.find((x) => x.variantId === l.materialVariantId);
    return t + (r?.cost ?? 0) * (Number(l.quantity) || 0) * (1 + (Number(l.wastagePct) || 0) / 100);
  }, 0);

  const submit = () => {
    const e: Record<string, string> = {};
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      if (!l.materialVariantId) e[`${i}.m`] = 'Choose a material';
      else if (seen.has(l.materialVariantId)) e[`${i}.m`] = 'Listed twice';
      seen.add(l.materialVariantId);
      const q = Number(l.quantity);
      if (!l.quantity || !Number.isFinite(q) || q <= 0) e[`${i}.q`] = 'More than 0';
      const w = Number(l.wastagePct || 0);
      if (!Number.isFinite(w) || w < 0 || w > 100) e[`${i}.w`] = '0 to 100';
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      {productId, lines: lines.map((l) => ({materialVariantId: l.materialVariantId, quantity: Number(l.quantity), wastagePct: Number(l.wastagePct || 0), notes: l.notes.trim() || undefined}))},
      {onSuccess: () => setDirty(false)},
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-on-surface-variant">
        Raw material for <strong>one piece</strong>. A work order uses this × its quantity. Material cost per piece:{' '}
        <strong className="text-espresso">{inr(Math.round(cost))}</strong>
      </p>
      {lines.length === 0 && <p className="rounded-lg bg-ivory-100 px-3 py-2 text-sm text-on-surface-variant">No materials yet. Add plywood, foam, polish, hardware…</p>}
      {lines.length > 0 && (
        <div className="hidden grid-cols-[1fr_6rem_6rem_1fr_auto] gap-2 px-1 text-xs font-semibold text-outline md:grid">
          <span>Material</span>
          <span>Qty / piece</span>
          <span>Wastage %</span>
          <span>Notes</span>
          <span />
        </div>
      )}
      {lines.map((l, i) => {
        const r = raw.find((x) => x.variantId === l.materialVariantId);
        return (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-ivory-200 p-2 md:grid-cols-[1fr_6rem_6rem_1fr_auto] md:border-0 md:p-0">
            <div className="col-span-2 md:col-span-1">
              <select className={cell} value={l.materialVariantId} aria-label="Material" aria-invalid={!!errors[`${i}.m`]} onChange={(e) => update(i, {materialVariantId: e.target.value})}>
                <option value="">Choose material</option>
                {raw.map((m) => (
                  <option key={m.variantId} value={m.variantId}>
                    {m.name} ({m.variantName}) · {inr(m.cost)}/{m.unit ?? 'pc'}
                  </option>
                ))}
              </select>
              {errors[`${i}.m`] && <span className="text-xs text-error">{errors[`${i}.m`]}</span>}
            </div>
            <div>
              <input className={cell} inputMode="decimal" value={l.quantity} aria-label="Quantity per piece" aria-invalid={!!errors[`${i}.q`]} onChange={(e) => update(i, {quantity: e.target.value.replace(/[^\d.]/g, '')})} />
              <span className="text-[11px] text-outline">{r?.unit ?? ''}</span>
              {errors[`${i}.q`] && <span className="block text-xs text-error">{errors[`${i}.q`]}</span>}
            </div>
            <div>
              <input className={cell} inputMode="decimal" value={l.wastagePct} aria-label="Wastage percent" aria-invalid={!!errors[`${i}.w`]} onChange={(e) => update(i, {wastagePct: e.target.value.replace(/[^\d.]/g, '')})} />
              {errors[`${i}.w`] && <span className="text-xs text-error">{errors[`${i}.w`]}</span>}
            </div>
            <input className={`${cell} col-span-2 md:col-span-1`} value={l.notes} maxLength={200} placeholder="e.g. for frame" aria-label="Notes" onChange={(e) => update(i, {notes: e.target.value})} />
            <button
              type="button"
              className="justify-self-end rounded-lg p-2 text-outline hover:bg-error-container hover:text-error"
              aria-label="Remove material"
              onClick={() => {
                setLines(lines.filter((_, j) => j !== i));
                setDirty(true);
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setLines([...lines, {materialVariantId: '', quantity: '1', wastagePct: '0', notes: ''}]);
            setDirty(true);
          }}
        >
          <Plus size={14} /> Add material
        </button>
        <div className="flex items-center gap-2">
          <Link to="/shop-admin/work-orders/new" className="btn-ghost">
            New work order
          </Link>
          <button type="button" className="btn-primary" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save BOM
          </button>
        </div>
      </div>
    </div>
  );
};

export default BomEditor;
