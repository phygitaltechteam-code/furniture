import {BUSINESS_LINE_LABEL, SOURCING_LABEL} from '@/types/manufacturing';
import {ConfirmDialog} from '@/components/Forms';
import {ShopProductImages} from '@/components/ShopProduct/ShopProductImages';
import BomEditor from '@/components/ShopProduct/BomEditor';
import {PageHeader} from '@/components/ui';
import {FormGroup} from '@/components/ui/FormLayout';
import {useDeleteShopProduct, useShopProduct} from '@/lib/react-query/queriesAndMutations/shopProduct';
import ProductStatusBadge from '@/pages/catalog/ProductStatusBadge';
import {PRODUCT_KIND_LABEL} from '@/types/catalog';
import {getErrorMessage} from '@/utils/axios';
import {rateLabel} from '@/lib/api/gst';
import {useGstRule} from '@/lib/react-query/queriesAndMutations/gst';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {Check, Loader2, Pencil, Trash2, X} from 'lucide-react';
import {ReactNode, useState} from 'react';
import {StockBadge} from './ShopProductList';

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? null : `₹${n.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;

const Detail = ({label, children, wide}: {label: string; children: ReactNode; wide?: boolean}) => (
  <div className={wide ? 'sm:col-span-2 lg:col-span-4' : ''}>
    <dt className="text-xs font-semibold text-outline">{label}</dt>
    <dd className="mt-1 whitespace-pre-line text-sm text-espresso">
      {children || children === 0 ? children : <span className="text-outline">—</span>}
    </dd>
  </div>
);

const YesNo = ({on, label}: {on: boolean; label: string}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
      on ? 'bg-secondary-container text-on-secondary-container' : 'bg-ivory-200 text-on-surface-variant'
    }`}
  >
    {on ? <Check size={13} /> : <X size={13} />} {label}
  </span>
);

/** /shop-admin/products/:productId */
const ShopProductDetail = () => {
  const {productId} = useParams({strict: false}) as {productId: string};
  const navigate = useNavigate();
  const {data: p, isPending, isError, error} = useShopProduct(productId);
  const remove = useDeleteShopProduct();
  const {data: gstRule} = useGstRule();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dims = p && [p.lengthCm, p.widthCm, p.heightCm].every(Boolean) ? `${p.lengthCm} × ${p.widthCm} × ${p.heightCm} cm (L × W × H)` : null;

  return (
    <>
      <PageHeader
        compact
        breadcrumbs={[{label: 'Products', to: '/shop-admin/products'}, {label: p?.sku ?? '…'}]}
        title={p?.name ?? 'Product'}
        actions={
          p && (
            <div className="flex flex-wrap items-center gap-2">
              <ProductStatusBadge status={p.status} />
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate({to: '/shop-admin/products/edit/$productId', params: {productId: p.id}})}
              >
                <Pencil size={14} /> Edit
              </button>
            </div>
          )
        }
      />

      {isPending ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading product…
        </div>
      ) : isError ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-serif text-headline-sm text-walnut">Product not available</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">{getErrorMessage(error, 'It may have been removed.')}</p>
          <Link to="/shop-admin/products" className="btn-ghost mt-4">
            Back to products
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <section className="panel space-y-6 p-4 md:p-6">
            <FormGroup title="Details">
              <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="SKU">{p.sku}</Detail>
                <Detail label="Kind">{PRODUCT_KIND_LABEL[p.productKind]}</Detail>
                <Detail label="Business line">{BUSINESS_LINE_LABEL[p.businessLine]}</Detail>
                <Detail label="Sourcing">{SOURCING_LABEL[p.sourcing]}</Detail>
                <Detail label="Category">{p.category.name}</Detail>
                <Detail label="Subcategory">{p.subcategory?.name}</Detail>
                <Detail label="Brand">{p.brand?.name}</Detail>
                <Detail label="Product Type">{p.productType}</Detail>
                <Detail label="Room">{p.roomType}</Detail>
                <Detail label="Material">{p.material}</Detail>
                <Detail label="Finish">{p.finish}</Detail>
                <Detail label="Colour">{p.colour}</Detail>
                <Detail label="Unit">{p.unit}</Detail>
                <Detail label="Stock">
                  <StockBadge qty={p.stock} />
                </Detail>
                <Detail label="Description" wide>
                  {p.detailedDesc}
                </Detail>
              </dl>
            </FormGroup>

            <FormGroup title="Prices & tax">
              <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="MRP">{money(p.mrp)}</Detail>
                <Detail label="Selling Price">
                  {money(p.sellingPrice)}
                  {p.sellingPrice < p.mrp ? ` (${Math.round((1 - p.sellingPrice / p.mrp) * 100)}% off)` : ''}
                </Detail>
                <Detail label="Wholesale Price">{p.wholesalePrice ? money(p.wholesalePrice) : null}</Detail>
                <Detail label="Purchase Cost">{p.purchasePrice ? money(p.purchasePrice) : null}</Detail>
                <Detail label="GST">{rateLabel(p.taxRate, gstRule)}</Detail>
                <Detail label="HSN Code">{p.hsnCode}</Detail>
                <Detail label="Margin">
                  {p.purchasePrice ? `${Math.round(((p.sellingPrice / (1 + (p.taxRate ?? 18) / 100) - p.purchasePrice) / p.sellingPrice) * 100)}%` : null}
                </Detail>
              </dl>
            </FormGroup>

            <FormGroup title={`Variants (${p.variants.length})`}>
              <div className="table-wrap rounded-lg border border-ivory-300">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="bg-ivory-100 text-xs font-semibold text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2">Variant</th>
                      <th className="px-3 py-2">Finish</th>
                      <th className="px-3 py-2">SKU / Barcode</th>
                      <th className="px-3 py-2 text-right">MRP</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Wholesale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.variants.map((v) => (
                      <tr key={v.id} className="border-t border-ivory-200">
                        <td className="px-3 py-2 font-medium">{v.variantName}</td>
                        <td className="px-3 py-2">{v.finish}</td>
                        <td className="px-3 py-2 font-mono text-xs text-on-surface-variant">{v.barcode ?? v.variantSku}</td>
                        <td className="px-3 py-2 text-right">{money(v.mrp ?? p.mrp)}</td>
                        <td className="px-3 py-2 text-right">{money(v.sellingPrice ?? p.sellingPrice)}</td>
                        <td className="px-3 py-2 text-right">{money(v.wholesalePrice ?? (p.wholesalePrice || null)) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormGroup>

            <FormGroup title="Dimensions, specifications & warranty">
              <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Dimensions" wide>
                  {dims}
                </Detail>
                {p.specifications.map((s) => (
                  <Detail key={s.key} label={s.key}>
                    {s.value}
                  </Detail>
                ))}
                <Detail label="Warranty">{p.warrantyMonths ? `${p.warrantyMonths} months` : null}</Detail>
                <Detail label="Warranty Terms" wide>
                  {p.warrantyTerms}
                </Detail>
                <Detail label="Care Instructions" wide>
                  {p.careInstructions}
                </Detail>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <YesNo on={p.assemblyRequired} label="Needs assembly" />
                <YesNo on={p.installationAvailable} label="Installation by us" />
                <YesNo on={p.isCustomizable} label="Made to measure" />
              </div>
            </FormGroup>

            {p.productKind === 'FINISHED_GOOD' && p.sourcing && p.sourcing !== 'TRADED' && (
              <FormGroup title="Bill of materials">
                <BomEditor productId={p.id} />
              </FormGroup>
            )}
          </section>

          <aside className="panel h-fit space-y-4 p-4 md:p-5">
            <FormGroup title="Photos">
              <ShopProductImages product={p} />
            </FormGroup>
            <p className="text-xs text-outline">
              Added {new Date(p.createdAt).toLocaleDateString('en-IN')}
              {p.createdBy ? ` by ${p.createdBy.fullname}` : ''}
              {p.tags.length ? ` · Tags: ${p.tags.join(', ')}` : ''}
            </p>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Product?"
        message={`"${p?.name}" will be archived and removed from your product list. Bill and order history is kept.`}
        confirmLabel="Delete Product"
        tone="danger"
        onConfirm={async () => {
          if (!p) return;
          try {
            await remove.mutateAsync(p.id);
            navigate({to: '/shop-admin/products'});
          } catch {
            // Error is handled by React Query toast
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
};

export default ShopProductDetail;
