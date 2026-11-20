import {ConfirmDialog, GenericInputField, GenericTextArea} from '@/components/Forms';
import {PageHeader} from '@/components/ui';
import {FormError, FormFooter, FormGroup} from '@/components/ui/FormLayout';
import useDebounce from '@/hooks/useDebounce';
import {useInventory} from '@/lib/react-query/queriesAndMutations/ecommerce';
import {useQuotation, useSaveQuotation} from '@/lib/react-query/queriesAndMutations/quotation';
import {applyServerErrors} from '@/lib/validation/fieldRules';
import {
  EMPTY_ITEM,
  EMPTY_QUOTATION,
  fromQuotation,
  GST_RATES,
  quotationSchema,
  QuotationValues,
  quoteTotals,
  toQuotationPayload,
} from '@/lib/validation/quotationSchema';
import {Quotation} from '@/types/quotation';
import {getErrorMessage} from '@/utils/axios';
import {inr} from '@/utils/money';
import {zodResolver} from '@hookform/resolvers/zod';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {Loader2, Package, PenLine, Plus, Search, Trash2} from 'lucide-react';
import {useState} from 'react';
import {FormProvider, get, useFieldArray, useForm, useFormContext} from 'react-hook-form';

const FIELDS = Object.keys(EMPTY_QUOTATION).filter((f) => f !== 'items');
const cell = 'field-input min-h-[38px] px-2.5 py-1.5 text-sm aria-[invalid=true]:border-error';

type InvItem = {
  variantId: string;
  availableStock: number;
  product: {id: string; name: string; taxRate: number; hsnCode: string | null; image: string | null};
  variant: {variantName: string; finish: string; sellingPrice: number; wholesalePrice?: number; sku: string};
};

/** Search the branch catalog and drop a product into a line */
const ProductPicker = ({onPick}: {onPick: (item: InvItem) => void}) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const search = useDebounce(text, 250);
  const {data, isFetching} = useInventory('shop-admin', {view: 'variant', limit: 8, search: search.trim() || undefined}, {enabled: open});
  const items = ((data as {items?: InvItem[]} | undefined)?.items ?? []) as InvItem[];
  return (
    <div className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Add from catalog: search product, SKU or barcode"
          className="field-input pl-9"
          aria-label="Search the catalog"
        />
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ivory-300 bg-white shadow-4">
          {isFetching && !items.length && (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-outline">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </li>
          )}
          {!isFetching && !items.length && <li className="px-3 py-3 text-sm text-outline">No matching products</li>}
          {items.map((i) => (
            <li key={i.variantId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(i);
                  setText('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ivory-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ivory-100">
                  {i.product.image ? <img src={i.product.image} alt="" className="h-full w-full object-cover" /> : <Package size={16} className="text-outline" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-espresso">{i.product.name}</span>
                  <span className="block truncate text-xs text-outline">
                    {i.variant.variantName} / {i.variant.finish} · {i.availableStock} in stock
                  </span>
                </span>
                <span className="text-sm font-semibold text-walnut">{inr(i.variant.sellingPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ItemsEditor = () => {
  const {control, register, watch, setValue, formState: {errors}} = useFormContext<QuotationValues>();
  const {fields, append, remove} = useFieldArray({control, name: 'items'});
  const items = watch('items');
  const saleType = watch('saleType');
  const extra = watch('extraCharges');
  const totals = quoteTotals(items, extra);
  const listError = get(errors, 'items')?.message as string | undefined;
  const err = (i: number, k: string) => get(errors, `items.${i}.${k}`)?.message as string | undefined;

  const pick = (inv: InvItem) => {
    const rate = inv.product.taxRate ?? 18;
    const tag = saleType === 'WHOLESALE' ? (inv.variant.wholesalePrice ?? inv.variant.sellingPrice) : inv.variant.sellingPrice;
    // Shop prices include GST; a quote shows the price before GST
    const row = {
      productId: inv.product.id,
      variantId: inv.variantId,
      description: `${inv.product.name} · ${inv.variant.variantName} / ${inv.variant.finish}`,
      hsnCode: inv.product.hsnCode ?? '',
      quantity: '1',
      unitPrice: String(Math.round((tag / (1 + rate / 100)) * 100) / 100),
      discount: '',
      taxRate: String((GST_RATES as readonly number[]).includes(rate) ? rate : 18),
    };
    // Fill the first empty line, else add one
    const empty = items.findIndex((i) => !i.description && !i.unitPrice);
    if (empty > -1) setValue(`items.${empty}`, row, {shouldDirty: true});
    else append(row);
  };

  return (
    <div className="space-y-3">
      <ProductPicker onPick={pick} />
      <div className="table-wrap rounded-lg border border-ivory-300">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-ivory-100 text-xs font-semibold text-on-surface-variant">
            <tr>
              <th className="w-8 px-3 py-2">#</th>
              <th className="px-3 py-2">Item *</th>
              <th className="w-24 px-3 py-2">HSN</th>
              <th className="w-20 px-3 py-2">Qty *</th>
              <th className="w-28 px-3 py-2">Rate (₹) *</th>
              <th className="w-24 px-3 py-2">Discount</th>
              <th className="w-20 px-3 py-2">GST</th>
              <th className="w-28 px-3 py-2 text-right">Amount</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {fields.map((row, i) => {
              const custom = !items[i]?.variantId;
              const rowError = err(i, 'description') ?? err(i, 'quantity') ?? err(i, 'unitPrice') ?? err(i, 'discount') ?? err(i, 'hsnCode');
              return (
                <tr key={row.id} className="border-t border-ivory-200 align-top">
                  <td className="px-3 py-3 text-outline">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-start gap-2">
                      <span title={custom ? 'Custom / made-to-measure line' : 'Catalog item'} className="mt-2.5 shrink-0 text-outline">
                        {custom ? <PenLine size={14} /> : <Package size={14} />}
                      </span>
                      <div className="w-full">
                        <input {...register(`items.${i}.description`)} placeholder="Custom item, e.g. Wardrobe 7x8 ft, laminate" aria-invalid={!!err(i, 'description')} aria-label={`Item ${i + 1} description`} className={cell} />
                        {rowError && <p className="field-error">{rowError}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input {...register(`items.${i}.hsnCode`)} inputMode="numeric" placeholder="9403" aria-invalid={!!err(i, 'hsnCode')} aria-label={`Item ${i + 1} HSN`} className={cell} />
                  </td>
                  <td className="px-2 py-2">
                    <input {...register(`items.${i}.quantity`)} inputMode="numeric" aria-invalid={!!err(i, 'quantity')} aria-label={`Item ${i + 1} quantity`} className={cell} />
                  </td>
                  <td className="px-2 py-2">
                    <input {...register(`items.${i}.unitPrice`)} inputMode="decimal" placeholder="0.00" aria-invalid={!!err(i, 'unitPrice')} aria-label={`Item ${i + 1} rate`} className={cell} />
                  </td>
                  <td className="px-2 py-2">
                    <input {...register(`items.${i}.discount`)} inputMode="decimal" placeholder="0" aria-invalid={!!err(i, 'discount')} aria-label={`Item ${i + 1} discount`} className={cell} />
                  </td>
                  <td className="px-2 py-2">
                    <select {...register(`items.${i}.taxRate`)} aria-label={`Item ${i + 1} GST`} className={cell}>
                      {GST_RATES.map((r) => (
                        <option key={r} value={String(r)}>
                          {r}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{inr(totals.lines[i] ?? 0)}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => remove(i)} disabled={fields.length === 1} aria-label={`Remove item ${i + 1}`} className="btn-icon hover:text-error disabled:opacity-30">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {listError && <p className="field-error">{listError}</p>}
      <button type="button" className="btn-text" onClick={() => append({...EMPTY_ITEM})}>
        <Plus size={15} /> Add a custom line
      </button>

      <div className="ml-auto w-full max-w-sm space-y-1.5 rounded-lg bg-ivory-100 p-4 text-sm">
        <div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span>{inr(totals.subtotal)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between"><span className="text-on-surface-variant">Discount</span><span>− {inr(totals.discount)}</span></div>}
        <div className="flex justify-between"><span className="text-on-surface-variant">GST</span><span>{inr(totals.tax)}</span></div>
        {totals.extraCharges > 0 && <div className="flex justify-between"><span className="text-on-surface-variant">Delivery / installation</span><span>{inr(totals.extraCharges)}</span></div>}
        <div className="flex justify-between border-t border-ivory-300 pt-2 text-base font-semibold text-walnut"><span>Total</span><span>{inr(totals.total)}</span></div>
      </div>
    </div>
  );
};

const SaleTypeToggle = () => {
  const {watch, setValue} = useFormContext<QuotationValues>();
  const value = watch('saleType');
  return (
    <div>
      <p className="field-label">Price list</p>
      <div className="inline-flex rounded-md border border-ivory-300 bg-white p-0.5" role="group" aria-label="Price list">
        {(['RETAIL', 'WHOLESALE'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={value === t}
            onClick={() => setValue('saleType', t, {shouldDirty: true})}
            className={`rounded px-4 py-2 text-sm font-semibold ${value === t ? 'bg-walnut text-white' : 'text-on-surface-variant hover:bg-ivory-100'}`}
          >
            {t === 'RETAIL' ? 'Retail' : 'Wholesale / dealer'}
          </button>
        ))}
      </div>
      <p className="field-hint">Catalog items you add use this price.</p>
    </div>
  );
};

const Form = ({quotation}: {quotation?: Quotation}) => {
  const navigate = useNavigate();
  const save = useSaveQuotation();
  const [formError, setFormError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const form = useForm<QuotationValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: quotation ? fromQuotation(quotation) : EMPTY_QUOTATION,
    mode: 'onTouched',
  });
  const {handleSubmit, setError, formState: {isSubmitting, isDirty}} = form;
  const leave = () =>
    quotation
      ? navigate({to: '/shop-admin/quotations/$quotationId', params: {quotationId: quotation.id}})
      : navigate({to: '/shop-admin/quotations'});

  const submit = handleSubmit(
    async (values) => {
      setFormError('');
      try {
        const res = await save.mutateAsync({...toQuotationPayload(quotationSchema.parse(values)), ...(quotation ? {id: quotation.id} : {})});
        navigate({to: '/shop-admin/quotations/$quotationId', params: {quotationId: res.data.id}});
      } catch (error) {
        if (!applyServerErrors(error, setError, FIELDS)) setFormError(getErrorMessage(error, 'Could not save the quotation'));
      }
    },
    () => setFormError('Some fields need attention. Check the highlighted fields below.'),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <div className="panel space-y-6 p-4 md:p-6">
          <FormGroup title="Customer" description="Who the quotation is for. The phone number links it to the customer at billing.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <GenericInputField name="customerName" label="Customer Name" kind="name" required autoFocus={!quotation} placeholder="Ritu Sharma" />
              <GenericInputField name="customerPhone" label="Customer Phone" kind="phone" required placeholder="98XXXXXXXX" />
              <GenericInputField name="customerEmail" label="Customer Email" kind="email" placeholder="name@example.com" />
              <GenericInputField name="customerGstin" label="Customer GSTIN" kind="gstin" placeholder="For business customers" />
              <GenericTextArea name="customerAddress" label="Delivery Address" rows={2} maxLength={500} className="sm:col-span-2" />
            </div>
          </FormGroup>

          <FormGroup title="Quote details">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <SaleTypeToggle />
              <GenericInputField name="validUntil" label="Valid Until" type="date" required />
              <GenericInputField name="extraCharges" label="Delivery / Installation Charges" kind="price" prefix="₹" hint="Added to the total (no GST)" />
            </div>
          </FormGroup>

          <FormGroup title="Items" description="Add catalog items, or custom lines for made-to-measure pieces. Rates are before GST.">
            <ItemsEditor />
          </FormGroup>

          <FormGroup title="Terms & notes">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
              <GenericTextArea name="terms" label="Terms & Conditions" rows={5} maxLength={2000} hint="Printed on the quotation" />
              <GenericTextArea name="notes" label="Internal Notes" rows={5} maxLength={1000} hint="Only your team sees these" />
            </div>
          </FormGroup>
        </div>

        <FormFooter
          onCancel={() => (isDirty ? setConfirmLeave(true) : leave())}
          saving={isSubmitting}
          saveLabel={quotation ? 'Save Changes' : 'Save Quotation'}
        />
        <ConfirmDialog
          open={confirmLeave}
          title="Discard changes?"
          message="You have unsaved changes on this quotation. Leaving now will lose them."
          confirmLabel="Discard"
          tone="danger"
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        />
      </form>
    </FormProvider>
  );
};

/** /shop-admin/quotations/new and /shop-admin/quotations/edit/:quotationId */
const QuotationFormPage = () => {
  const {quotationId} = useParams({strict: false}) as {quotationId?: string};
  const {data, isPending, isError, error} = useQuotation(quotationId);
  const header = (
    <PageHeader
      compact
      breadcrumbs={[{label: 'Quotations', to: '/shop-admin/quotations'}, {label: quotationId ? (data?.quotationNumber ?? '…') : 'New'}]}
      title={quotationId ? `Edit ${data?.quotationNumber ?? 'quotation'}` : 'New Quotation'}
    />
  );
  if (!quotationId) {
    return (
      <>
        {header}
        <Form />
      </>
    );
  }
  return (
    <>
      {header}
      {isPending ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading quotation…
        </div>
      ) : isError ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-serif text-headline-sm text-walnut">Quotation not available</p>
          <p className="mt-1 text-sm text-on-surface-variant">{getErrorMessage(error, 'It may have been removed.')}</p>
          <Link to="/shop-admin/quotations" className="btn-ghost mt-4">
            Back to quotations
          </Link>
        </div>
      ) : !['DRAFT', 'SENT'].includes(data.status) ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-serif text-headline-sm text-walnut">This quotation can no longer be edited</p>
          <p className="mt-1 text-sm text-on-surface-variant">Only draft and sent quotations can be changed.</p>
          <Link to="/shop-admin/quotations/$quotationId" params={{quotationId: data.id}} className="btn-ghost mt-4">
            Open quotation
          </Link>
        </div>
      ) : (
        <Form key={data.id} quotation={data} />
      )}
    </>
  );
};

export default QuotationFormPage;
