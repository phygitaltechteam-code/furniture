import FormDialog from '@/components/ui/FormDialog';
import {useCreateDelivery, useDeliveryTeam} from '@/lib/react-query/queriesAndMutations/manufacturing';
import {DeliveryPayload, SLOT_LABEL, Slot} from '@/types/manufacturing';
import {getErrorMessage} from '@/utils/axios';
import {nameError, phoneError, phoneInputProps, toPartyName, toPhone} from '@/utils/inputRules';
import {Plus, Trash2} from 'lucide-react';
import {useState} from 'react';

const input = 'field-input min-h-[40px] w-full px-3 py-2 text-sm aria-[invalid=true]:border-error';
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

type Prefill = Partial<Omit<DeliveryPayload, 'items'>> & {items?: {name: string; quantity: number}[]};

/** Schedule a delivery (and installation) for a work order, bill or online order, or a manual one */
const ScheduleDeliveryDialog = ({open, onClose, prefill}: {open: boolean; onClose: () => void; prefill: Prefill}) => {
  const create = useCreateDelivery();
  const {data: team} = useDeliveryTeam();
  const [f, setF] = useState({
    customerName: prefill.customerName ?? '',
    customerPhone: toPhone(prefill.customerPhone ?? ''),
    address: prefill.address ?? '',
    city: prefill.city ?? '',
    postalCode: prefill.postalCode ?? '',
    scheduledDate: tomorrow(),
    slot: 'MORNING' as Slot,
    installation: prefill.installation ?? true,
    assignedToId: '',
    notes: '',
  });
  const [items, setItems] = useState(prefill.items?.length ? prefill.items : [{name: '', quantity: 1}]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({...x, [k]: v}));

  const validate = () => {
    const e: Record<string, string> = {};
    const n = nameError(f.customerName, 'Customer Name', true);
    if (n) e.customerName = n;
    const p = phoneError(f.customerPhone, 'Customer Phone', true);
    if (p) e.customerPhone = p;
    if (f.address.trim().length < 5) e.address = 'Enter the full delivery address';
    if (f.postalCode && !/^[1-9]\d{5}$/.test(f.postalCode)) e.postalCode = 'Pincode must be 6 digits';
    if (!f.scheduledDate) e.scheduledDate = 'Delivery Date is required';
    else if (f.scheduledDate < today()) e.scheduledDate = 'Delivery Date cannot be in the past';
    if (!items.some((i) => i.name.trim())) e.items = 'Add at least one item';
    if (items.some((i) => i.name.trim() && (!Number.isInteger(i.quantity) || i.quantity < 1))) e.items = 'Quantity must be at least 1';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    setFormError('');
    if (!validate()) return;
    try {
      await create.mutateAsync({
        orderId: prefill.orderId,
        salesBillId: prefill.salesBillId,
        workOrderId: prefill.workOrderId,
        customerName: f.customerName.trim(),
        customerPhone: f.customerPhone,
        address: f.address.trim(),
        city: f.city.trim() || undefined,
        postalCode: f.postalCode || undefined,
        items: items.filter((i) => i.name.trim()).map((i) => ({name: i.name.trim(), quantity: i.quantity})),
        scheduledDate: f.scheduledDate,
        slot: f.slot,
        installation: f.installation,
        assignedToId: f.assignedToId || undefined,
        notes: f.notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not schedule the delivery'));
    }
  };

  const Err = ({k}: {k: string}) => (errors[k] ? <span className="mt-1 block text-xs text-error">{errors[k]}</span> : null);

  return (
    <FormDialog open={open} title="Schedule delivery" onClose={onClose} onSubmit={submit} saving={create.isPending} error={formError} saveLabel="Schedule">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-on-surface-variant">
          Customer Name *
          <input className={input} value={f.customerName} maxLength={120} aria-invalid={!!errors.customerName} onChange={(e) => set('customerName', toPartyName(e.target.value))} />
          <Err k="customerName" />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          Customer Phone *
          <input className={input} value={f.customerPhone} {...phoneInputProps} aria-invalid={!!errors.customerPhone} onChange={(e) => set('customerPhone', toPhone(e.target.value))} />
          <Err k="customerPhone" />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant sm:col-span-2">
          Delivery Address *
          <textarea className={input} rows={2} maxLength={500} value={f.address} aria-invalid={!!errors.address} onChange={(e) => set('address', e.target.value)} />
          <Err k="address" />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          City
          <input className={input} value={f.city} maxLength={60} onChange={(e) => set('city', e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          Pincode
          <input className={input} value={f.postalCode} inputMode="numeric" maxLength={6} aria-invalid={!!errors.postalCode} onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))} />
          <Err k="postalCode" />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          Delivery Date *
          <input type="date" className={input} min={today()} value={f.scheduledDate} aria-invalid={!!errors.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />
          <Err k="scheduledDate" />
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          Time slot
          <select className={input} value={f.slot} onChange={(e) => set('slot', e.target.value)}>
            {(Object.keys(SLOT_LABEL) as Slot[]).map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          Delivery person
          <select className={input} value={f.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
            <option value="">Assign later</option>
            {team?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullname}
                {t.department ? ` · ${t.department}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-5 text-sm text-espresso">
          <input type="checkbox" className="h-4 w-4 accent-walnut" checked={f.installation} onChange={(e) => set('installation', e.target.checked)} />
          Installation at the customer’s home
        </label>
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-semibold text-on-surface-variant">Items *</p>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2">
                <input className={input} value={it.name} maxLength={150} placeholder="Item" aria-label="Item" onChange={(e) => setItems(items.map((x, j) => (j === i ? {...x, name: e.target.value} : x)))} />
                <input
                  className={input}
                  inputMode="numeric"
                  value={it.quantity}
                  aria-label="Quantity"
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? {...x, quantity: Number(e.target.value.replace(/\D/g, '')) || 0} : x)))}
                />
                <button type="button" className="rounded-lg p-2 text-outline hover:text-error" aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-2" onClick={() => setItems([...items, {name: '', quantity: 1}])}>
            <Plus size={14} /> Add item
          </button>
          <Err k="items" />
        </div>
        <label className="text-xs font-semibold text-on-surface-variant sm:col-span-2">
          Notes for the team
          <input className={input} value={f.notes} maxLength={500} placeholder="Floor, lift, landmark, what to carry" onChange={(e) => set('notes', e.target.value)} />
        </label>
      </div>
    </FormDialog>
  );
};

export default ScheduleDeliveryDialog;
