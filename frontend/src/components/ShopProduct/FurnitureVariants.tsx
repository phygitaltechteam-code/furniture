import {EMPTY_VARIANT, ShopProductValues} from '@/lib/validation/shopProductSchema';
import {Plus, Trash2, Wand2} from 'lucide-react';
import {useState} from 'react';
import {get, useFieldArray, useFormContext} from 'react-hook-form';

const cell =
  'field-input min-h-[38px] px-2.5 py-1.5 text-sm aria-[invalid=true]:border-error';

/**
 * Variants of a product: a configuration ("3 Seater", "King 6x6.5 ft") in a
 * finish ("Walnut", "Grey Fabric"). Each row gets its own SKU, barcode and
 * stock. Blank prices use the product's prices. Removing a saved row turns
 * it off (it stays for bills and order history).
 */
export const FurnitureVariants = ({isNew}: {isNew: boolean}) => {
  const {
    control,
    register,
    formState: {errors},
  } = useFormContext<ShopProductValues>();
  const {fields, append, remove} = useFieldArray({control, name: 'variants'});
  const [sizes, setSizes] = useState('');
  const [finishes, setFinishes] = useState('');
  const listError = get(errors, 'variants')?.message as string | undefined;

  /** Every configuration × finish typed in the quick builder */
  const build = () => {
    const names = sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const fins = finishes.split(',').map((s) => s.trim()).filter(Boolean);
    if (!fins.length) return;
    (names.length ? names : ['Standard']).forEach((variantName) =>
      fins.forEach((finish) => append({...EMPTY_VARIANT, variantName, finish})),
    );
    setSizes('');
    setFinishes('');
  };

  const err = (i: number, k: string) =>
    get(errors, `variants.${i}.${k}`)?.message as string | undefined;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-walnut-200 bg-walnut-50/60 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-walnut">
          <Wand2 size={14} /> Quick builder: makes every combination
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={sizes}
            onChange={(e) => setSizes(e.target.value)}
            placeholder="Configurations, e.g. 3 Seater, 2 Seater"
            className={cell}
            aria-label="Configurations, comma separated"
          />
          <input
            value={finishes}
            onChange={(e) => setFinishes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), build())}
            placeholder="Finishes, e.g. Walnut, Teak Natural"
            className={cell}
            aria-label="Finishes, comma separated"
          />
          <button type="button" onClick={build} disabled={!finishes.trim()} className="btn-ghost">
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div className="table-wrap rounded-lg border border-ivory-300">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-ivory-100 text-xs font-semibold text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">Variant *</th>
              <th className="px-3 py-2">Finish / Colour *</th>
              <th className="px-3 py-2">MRP (₹)</th>
              <th className="px-3 py-2">Price (₹)</th>
              <th className="px-3 py-2">Wholesale (₹)</th>
              {isNew && <th className="px-3 py-2">Opening Stock</th>}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {fields.map((row, i) => {
              const rowError =
                err(i, 'variantName') ?? err(i, 'finish') ?? err(i, 'sellingPrice') ?? err(i, 'mrp') ?? err(i, 'openingStock');
              return (
                <tr key={row.id} className="border-t border-ivory-200 align-top">
                  <td className="px-2 py-2">
                    <input
                      {...register(`variants.${i}.variantName`)}
                      aria-label={`Variant ${i + 1} name`}
                      aria-invalid={!!err(i, 'variantName')}
                      placeholder="Standard"
                      className={cell}
                    />
                    {rowError && <p className="field-error">{rowError}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      {...register(`variants.${i}.finish`)}
                      aria-label={`Variant ${i + 1} finish`}
                      aria-invalid={!!err(i, 'finish')}
                      placeholder="Walnut"
                      className={cell}
                    />
                  </td>
                  {(['mrp', 'sellingPrice', 'wholesalePrice'] as const).map((k) => (
                    <td key={k} className="w-28 px-2 py-2">
                      <input
                        {...register(`variants.${i}.${k}`)}
                        inputMode="decimal"
                        aria-label={`Variant ${i + 1} ${k}`}
                        aria-invalid={!!err(i, k)}
                        placeholder="Same"
                        className={cell}
                      />
                    </td>
                  ))}
                  {isNew && (
                    <td className="w-28 px-2 py-2">
                      <input
                        {...register(`variants.${i}.openingStock`)}
                        inputMode="numeric"
                        aria-label={`Variant ${i + 1} opening stock`}
                        aria-invalid={!!err(i, 'openingStock')}
                        placeholder="0"
                        className={cell}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={fields.length === 1}
                      aria-label={`Remove variant ${i + 1}`}
                      className="btn-icon hover:text-error disabled:opacity-30"
                    >
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
      <button type="button" onClick={() => append({...EMPTY_VARIANT, variantName: '', finish: ''})} className="btn-text">
        <Plus size={15} /> Add a variant
      </button>
    </div>
  );
};

/** Key / value specifications: seats, storage, load capacity, motor… */
export const SpecificationsEditor = () => {
  const {
    control,
    register,
    formState: {errors},
  } = useFormContext<ShopProductValues>();
  const {fields, append, remove} = useFieldArray({control, name: 'specifications'});
  const err = (i: number, k: string) =>
    get(errors, `specifications.${i}.${k}`)?.message as string | undefined;
  return (
    <div className="space-y-2">
      {fields.map((row, i) => (
        <div key={row.id} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
          <div>
            <input {...register(`specifications.${i}.key`)} placeholder="Seating capacity" aria-label={`Specification ${i + 1} name`} aria-invalid={!!err(i, 'key')} className={cell} />
            {err(i, 'key') && <p className="field-error">{err(i, 'key')}</p>}
          </div>
          <div>
            <input {...register(`specifications.${i}.value`)} placeholder="3" aria-label={`Specification ${i + 1} value`} aria-invalid={!!err(i, 'value')} className={cell} />
            {err(i, 'value') && <p className="field-error">{err(i, 'value')}</p>}
          </div>
          <button type="button" onClick={() => remove(i)} aria-label={`Remove specification ${i + 1}`} className="btn-icon hover:text-error">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => append({key: '', value: ''})} className="btn-text">
        <Plus size={15} /> Add a specification
      </button>
    </div>
  );
};
