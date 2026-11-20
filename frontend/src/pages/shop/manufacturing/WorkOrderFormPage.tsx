import {ConfirmDialog, GenericDropdown, GenericInputField, GenericTextArea} from '@/components/Forms';
import {PageHeader} from '@/components/ui';
import {FormError, FormFooter, FormGroup} from '@/components/ui/FormLayout';
import {getBom} from '@/lib/api/manufacturing';
import {uploadPhoto} from '@/lib/api/upload';
import {useSaveWorkOrder, useWorkOrder, useWorkOrderOptions} from '@/lib/react-query/queriesAndMutations/manufacturing';
import {applyServerErrors} from '@/lib/validation/fieldRules';
import {EMPTY_WORK_ORDER, fromWorkOrder, toWorkOrderPayload, workOrderSchema, WorkOrderValues} from '@/lib/validation/workOrderSchema';
import {WorkOrder, WorkOrderOptions} from '@/types/manufacturing';
import {getErrorMessage} from '@/utils/axios';
import {inr} from '@/utils/money';
import {zodResolver} from '@hookform/resolvers/zod';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {Factory, ImagePlus, Loader2, PackageCheck, Plus, Trash2, UserRound, Wand2, X} from 'lucide-react';
import {useState} from 'react';
import toast from 'react-hot-toast';
import {FormProvider, get, useFieldArray, useForm, useFormContext, useWatch} from 'react-hook-form';

const FIELDS = Object.keys(EMPTY_WORK_ORDER);
const cell = 'field-input min-h-[40px] px-2.5 py-1.5 text-sm aria-[invalid=true]:border-error';

/** Made for stock, or for one customer */
const TypeToggle = ({locked}: {locked: boolean}) => {
  const {setValue, control} = useFormContext<WorkOrderValues>();
  const type = useWatch({control, name: 'type'});
  const opts = [
    {value: 'MADE_TO_STOCK' as const, icon: PackageCheck, title: 'For stock', text: 'Make catalogue pieces; they go into stock on a rack and are sold from there.'},
    {value: 'MADE_TO_ORDER' as const, icon: UserRound, title: 'Customer order', text: 'Build to the customer’s size, design, finish and accessories; delivered to them.'},
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Work order type">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={type === o.value}
          disabled={locked}
          onClick={() => setValue('type', o.value, {shouldDirty: true, shouldValidate: false})}
          className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
            type === o.value ? 'border-walnut bg-brass-soft/40' : 'border-ivory-300 bg-white hover:border-walnut/50'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <o.icon size={20} className="mt-0.5 shrink-0 text-walnut" />
          <span>
            <span className="block font-semibold text-espresso">{o.title}</span>
            <span className="block text-xs text-on-surface-variant">{o.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

/** Catalogue product + variant; fills the title and design fields */
const ProductChoice = ({options, locked}: {options: WorkOrderOptions; locked: boolean}) => {
  const {setValue, control, formState} = useFormContext<WorkOrderValues>();
  const [productId, type] = useWatch({control, name: ['productId', 'type']});
  const product = options.finished.find((p) => p.id === productId);
  const variantErr = get(formState.errors, 'variantId')?.message as string | undefined;
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
          Catalogue product {type === 'MADE_TO_STOCK' && <span className="text-error">*</span>}
        </span>
        <select
          className={cell}
          disabled={locked}
          value={productId}
          onChange={(e) => {
            const p = options.finished.find((x) => x.id === e.target.value);
            setValue('productId', e.target.value, {shouldDirty: true});
            setValue('variantId', p?.variants[0]?.id ?? '', {shouldDirty: true, shouldValidate: formState.isSubmitted});
            if (p) {
              setValue('title', p.name, {shouldDirty: true, shouldValidate: formState.isSubmitted});
              setValue('category', p.category.name, {shouldDirty: true});
              setValue('productType', p.productType ?? '', {shouldDirty: true});
              setValue('material', p.material ?? '', {shouldDirty: true});
              setValue('lengthCm', p.lengthCm ? String(p.lengthCm) : '', {shouldDirty: true});
              setValue('widthCm', p.widthCm ? String(p.widthCm) : '', {shouldDirty: true});
              setValue('heightCm', p.heightCm ? String(p.heightCm) : '', {shouldDirty: true});
              setValue('finish', p.variants[0]?.finish ?? '', {shouldDirty: true});
            }
          }}
        >
          <option value="">{type === 'MADE_TO_ORDER' ? 'Custom piece (not in the catalogue)' : 'Choose a product'}</option>
          {options.finished.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.sourcing !== 'TRADED' ? '' : ' (traded item)'}
              {p.hasBom ? ' · BOM ready' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
          Variant / finish {type === 'MADE_TO_STOCK' && <span className="text-error">*</span>}
        </span>
        <select
          className={cell}
          disabled={locked || !product}
          aria-invalid={!!variantErr}
          value={useWatch({control, name: 'variantId'})}
          onChange={(e) => {
            setValue('variantId', e.target.value, {shouldDirty: true, shouldValidate: formState.isSubmitted});
            const v = product?.variants.find((x) => x.id === e.target.value);
            if (v) setValue('finish', v.finish, {shouldDirty: true});
          }}
        >
          <option value="">{product ? 'Choose' : '—'}</option>
          {product?.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.variantName} · {v.finish}
            </option>
          ))}
        </select>
        {variantErr && <span className="mt-1 block text-xs text-error">{variantErr}</span>}
      </label>
    </div>
  );
};

/** Extra accessories with price (e.g. hydraulic storage, headboard cushion) */
const Accessories = () => {
  const {control, register, formState} = useFormContext<WorkOrderValues>();
  const {fields, append, remove} = useFieldArray({control, name: 'accessories'});
  return (
    <div className="space-y-2">
      {fields.map((f, i) => {
        const err = (k: string) => get(formState.errors, `accessories.${i}.${k}`)?.message as string | undefined;
        return (
          <div key={f.id} className="grid grid-cols-[1fr_5rem_7rem_auto] items-start gap-2">
            <div>
              <input {...register(`accessories.${i}.name`)} className={cell} placeholder="e.g. Hydraulic storage" aria-label="Accessory" aria-invalid={!!err('name')} />
              {err('name') && <span className="text-xs text-error">{err('name')}</span>}
            </div>
            <input {...register(`accessories.${i}.quantity`)} inputMode="numeric" className={cell} aria-label="Quantity" aria-invalid={!!err('quantity')} />
            <input {...register(`accessories.${i}.price`)} inputMode="decimal" className={cell} placeholder="Price ₹" aria-label="Price" aria-invalid={!!err('price')} />
            <button type="button" onClick={() => remove(i)} className="rounded-lg p-2 text-outline hover:bg-error-container hover:text-error" aria-label="Remove accessory">
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn-ghost" onClick={() => append({name: '', quantity: '1', price: ''})}>
        <Plus size={14} /> Add accessory
      </button>
    </div>
  );
};

/** Customer's design photos / sketches */
const DesignPhotos = () => {
  const {setValue, control} = useFormContext<WorkOrderValues>();
  const images = useWatch({control, name: 'designImages'});
  const [busy, setBusy] = useState(false);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 8 - images.length)) {
        if (!/^image\/(jpe?g|png|webp)$/.test(f.type)) {
          toast.error(`${f.name}: use a JPG, PNG or WEBP photo`);
          continue;
        }
        if (f.size > 5 * 1024 * 1024) {
          toast.error(`${f.name} is over 5 MB`);
          continue;
        }
        urls.push(await uploadPhoto(f));
      }
      setValue('designImages', [...images, ...urls], {shouldDirty: true});
    } catch (e) {
      toast.error(getErrorMessage(e, 'Could not upload the photo'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-3">
      {images.map((url) => (
        <div key={url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-ivory-300">
          <img src={url} alt="Design" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => setValue('designImages', images.filter((u) => u !== url), {shouldDirty: true})}
            className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-error shadow"
            aria-label="Remove photo"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {images.length < 8 && (
        <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ivory-300 text-xs text-on-surface-variant hover:border-walnut">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          {busy ? 'Uploading…' : 'Add photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => add(e.target.files)} />
        </label>
      )}
    </div>
  );
};

/** Raw material plan: picked by hand or loaded from the product's bill of materials */
const MaterialsEditor = ({options, locked}: {options: WorkOrderOptions; locked: boolean}) => {
  const {control, register, setValue, formState} = useFormContext<WorkOrderValues>();
  const {fields, append, remove, replace} = useFieldArray({control, name: 'materials'});
  const [productId, quantity, materials] = useWatch({control, name: ['productId', 'quantity', 'materials']});
  const product = options.finished.find((p) => p.id === productId);
  const [loading, setLoading] = useState(false);
  const listErr = get(formState.errors, 'materials')?.message as string | undefined;

  const loadBom = async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const bom = (await getBom(productId)).data;
      const qty = Math.max(1, Number(quantity) || 1);
      replace(
        bom.bomLines.map((l) => ({
          variantId: l.materialVariantId,
          plannedQty: String(Math.max(1, Math.ceil(l.quantity * qty * (1 + l.wastagePct / 100)))),
        })),
      );
      toast.success(`${bom.bomLines.length} materials loaded for ${qty} pc${qty === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Could not load the bill of materials'));
    } finally {
      setLoading(false);
    }
  };

  const cost = materials.reduce((t, m) => t + (options.raw.find((r) => r.variantId === m.variantId)?.cost ?? 0) * (Number(m.plannedQty) || 0), 0);

  if (locked) {
    return <p className="text-sm text-on-surface-variant">Material is already issued. Issue more or return material from the work order page.</p>;
  }
  return (
    <div className="space-y-2">
      {product?.hasBom && (
        <button type="button" className="btn-ghost" onClick={loadBom} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Load from bill of materials
        </button>
      )}
      {fields.length === 0 && (
        <p className="rounded-lg bg-ivory-100 px-3 py-2 text-sm text-on-surface-variant">
          {product?.hasBom
            ? 'Leave empty to use the product’s bill of materials × quantity (with wastage).'
            : 'Add the plywood, foam, polish, hardware… this job needs. They leave stock when you issue them.'}
        </p>
      )}
      {fields.map((f, i) => {
        const r = options.raw.find((x) => x.variantId === materials[i]?.variantId);
        const qtyErr = get(formState.errors, `materials.${i}.plannedQty`)?.message as string | undefined;
        const short = r && Number(materials[i]?.plannedQty) > r.inStock;
        return (
          <div key={f.id} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]">
            <select
              className={cell}
              value={materials[i]?.variantId ?? ''}
              onChange={(e) => setValue(`materials.${i}.variantId`, e.target.value, {shouldDirty: true})}
              aria-label="Raw material"
            >
              <option value="">Choose material</option>
              {options.raw.map((m) => (
                <option key={m.variantId} value={m.variantId}>
                  {m.name} ({m.variantName}) · {m.inStock} {m.unit ?? 'pcs'} in stock{m.rackNo ? ` · ${m.rackNo}` : ''}
                </option>
              ))}
            </select>
            <div>
              <input {...register(`materials.${i}.plannedQty`)} inputMode="numeric" className={cell} aria-label="Quantity" aria-invalid={!!qtyErr} />
              {qtyErr && <span className="text-xs text-error">{qtyErr}</span>}
            </div>
            <p className={`hidden pt-2.5 text-xs sm:block ${short ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>
              {r ? (short ? `Short: only ${r.inStock}` : `${inr(r.cost * (Number(materials[i]?.plannedQty) || 0))}`) : ''}
            </p>
            <button type="button" onClick={() => remove(i)} className="rounded-lg p-2 text-outline hover:bg-error-container hover:text-error" aria-label="Remove material">
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      {listErr && <p className="text-xs text-error">{listErr}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost" onClick={() => append({variantId: '', plannedQty: '1'})}>
          <Plus size={14} /> Add material
        </button>
        {fields.length > 0 && <p className="text-sm text-on-surface-variant">Planned material cost: <strong className="text-espresso">{inr(cost)}</strong></p>}
      </div>
    </div>
  );
};

const Form = ({workOrder, options}: {workOrder?: WorkOrder; options: WorkOrderOptions}) => {
  const navigate = useNavigate();
  const save = useSaveWorkOrder();
  const [formError, setFormError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const locked = !!workOrder && workOrder.status !== 'PLANNED';
  const form = useForm<WorkOrderValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: workOrder ? fromWorkOrder(workOrder) : EMPTY_WORK_ORDER,
    mode: 'onTouched',
  });
  const {handleSubmit, setError, control, formState: {isSubmitting, isDirty}} = form;
  const type = useWatch({control, name: 'type'});
  const mto = type === 'MADE_TO_ORDER';
  const leave = () =>
    workOrder ? navigate({to: '/shop-admin/work-orders/$workOrderId', params: {workOrderId: workOrder.id}}) : navigate({to: '/shop-admin/work-orders'});

  const submit = handleSubmit(
    async (values) => {
      setFormError('');
      try {
        const body = toWorkOrderPayload(workOrderSchema.parse(values), locked);
        const res = await save.mutateAsync({...body, ...(workOrder ? {id: workOrder.id} : {})});
        navigate({to: '/shop-admin/work-orders/$workOrderId', params: {workOrderId: res.data.id}});
      } catch (error) {
        if (!applyServerErrors(error, setError, FIELDS)) setFormError(getErrorMessage(error, 'Could not save the work order'));
      }
    },
    () => setFormError('Some fields need attention. Check the highlighted fields below.'),
  );

  const team = options.team.map((t) => ({value: t.id, label: `${t.fullname}${t.department ? ` · ${t.department}` : ''}`}));

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <div className="panel space-y-6 p-4 md:p-6">
          <FormGroup title="What are we making?" description={locked ? 'Material is issued: the item and quantity are fixed.' : undefined}>
            <div className="space-y-4">
              <TypeToggle locked={locked} />
              <ProductChoice options={options} locked={locked} />
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <GenericInputField name="title" label="Item to make" kind="text" required className="sm:col-span-2" placeholder="e.g. Custom king bed with storage" />
                <GenericInputField name="quantity" label="Quantity" kind="quantity" required disabled={locked} />
                <GenericDropdown
                  name="priority"
                  label="Priority"
                  options={[
                    {value: 'LOW', label: 'Low'},
                    {value: 'NORMAL', label: 'Normal'},
                    {value: 'HIGH', label: 'High'},
                    {value: 'URGENT', label: 'Urgent'},
                  ]}
                />
              </div>
            </div>
          </FormGroup>

          {mto && (
            <FormGroup title="Customer" description="Who it is for and where it is delivered.">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <GenericInputField name="customerName" label="Customer Name" kind="name" required placeholder="Neha Joshi" />
                <GenericInputField name="customerPhone" label="Customer Phone" kind="phone" required placeholder="98XXXXXXXX" />
                <GenericTextArea name="customerAddress" label="Delivery Address" rows={2} maxLength={500} className="sm:col-span-2 lg:col-span-1" />
              </div>
            </FormGroup>
          )}

          <FormGroup title="Design & size" description={mto ? 'The customer’s size, design, finish and extras. Photos help the karigar.' : 'Filled from the product; change only if this batch differs.'}>
            <div className="space-y-4">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <GenericInputField name="category" label="Category" kind="text" placeholder="Beds, Sofas, Wardrobes…" />
                <GenericInputField name="productType" label="Product Type" kind="text" placeholder="Bed, Sofa, Wardrobe…" />
                <GenericInputField name="material" label="Material" kind="text" placeholder="Sheesham, BWP Plywood…" />
                <GenericInputField name="finish" label="Finish" kind="text" placeholder="Walnut, Oak laminate…" />
                <GenericInputField name="lengthCm" label="Length (cm)" kind="price" />
                <GenericInputField name="widthCm" label="Width (cm)" kind="price" />
                <GenericInputField name="heightCm" label="Height (cm)" kind="price" />
                <GenericInputField name="colour" label="Colour" kind="text" placeholder="Dark walnut, beige fabric" />
                <GenericInputField name="sizeNote" label="Customer size (their words)" kind="text" placeholder="King 6.5 x 7 ft" className="sm:col-span-2" />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-on-surface-variant">Extra accessories</p>
                <Accessories />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-on-surface-variant">Design photos / sketches</p>
                <DesignPhotos />
              </div>
              <GenericTextArea name="specNotes" label="Design notes" rows={3} maxLength={2000} placeholder="Shape, joints, handles, fabric, anything the karigar must know" />
            </div>
          </FormGroup>

          <FormGroup title="Raw material" description="What leaves the godown for this job. Issued from the work order page.">
            <MaterialsEditor options={options} locked={locked} />
          </FormGroup>

          <FormGroup title="Planning & cost">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <GenericInputField name="startDate" label="Start Date" type="date" />
              <GenericInputField name="dueDate" label="Due Date" type="date" />
              <GenericDropdown name="assignedToId" label="Karigar / supervisor" placeholder="Not assigned" options={team} />
              {!mto && <GenericInputField name="rackNo" label="Rack for finished pieces" kind="text" placeholder="SR-A2" />}
              <GenericInputField name="labourCost" label="Labour Cost" kind="price" prefix="₹" />
              <GenericInputField name="overheadCost" label="Overhead Cost" kind="price" prefix="₹" hint="Electricity, transport, wastage" />
              {mto && <GenericInputField name="quotedPrice" label="Agreed Price" kind="price" prefix="₹" hint="Price agreed with the customer" />}
              {mto && <GenericInputField name="advancePaid" label="Advance Paid" kind="price" prefix="₹" />}
              <GenericTextArea name="notes" label="Notes" rows={2} maxLength={1000} className="sm:col-span-2 lg:col-span-4" />
            </div>
          </FormGroup>
        </div>

        <FormFooter onCancel={() => (isDirty ? setConfirmLeave(true) : leave())} saving={isSubmitting} saveLabel={workOrder ? 'Save Changes' : 'Create Work Order'} />
        <ConfirmDialog
          open={confirmLeave}
          title="Discard changes?"
          message="You have unsaved changes on this work order. Leaving now will lose them."
          confirmLabel="Discard"
          tone="danger"
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        />
      </form>
    </FormProvider>
  );
};

/** /shop-admin/work-orders/new and /shop-admin/work-orders/edit/:workOrderId */
const WorkOrderFormPage = () => {
  const {workOrderId} = useParams({strict: false}) as {workOrderId?: string};
  const {data, isPending, isError, error} = useWorkOrder(workOrderId);
  const options = useWorkOrderOptions();
  const header = (
    <PageHeader
      compact
      breadcrumbs={[{label: 'Work Orders', to: '/shop-admin/work-orders'}, {label: workOrderId ? (data?.woNumber ?? '…') : 'New'}]}
      title={workOrderId ? `Edit ${data?.woNumber ?? 'work order'}` : 'New Work Order'}
    />
  );
  if ((workOrderId && isPending) || options.isPending) {
    return (
      <>
        {header}
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      </>
    );
  }
  if ((workOrderId && isError) || options.isError || !options.data) {
    return (
      <>
        {header}
        <div className="panel px-6 py-12 text-center">
          <Factory className="mx-auto text-outline" />
          <p className="mt-2 font-serif text-headline-sm text-walnut">Work order not available</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">{getErrorMessage(error ?? options.error, 'Manufacturing may not be enabled for your plan.')}</p>
          <Link to="/shop-admin/work-orders" className="btn-ghost mt-4">
            Back to work orders
          </Link>
        </div>
      </>
    );
  }
  if (data && ['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(data.status)) {
    return (
      <>
        {header}
        <p className="panel p-6 text-body-sm text-on-surface-variant">A {data.status.toLowerCase()} work order cannot be edited.</p>
      </>
    );
  }
  return (
    <>
      {header}
      <Form key={data?.id ?? 'new'} workOrder={data} options={options.data} />
    </>
  );
};

export default WorkOrderFormPage;
