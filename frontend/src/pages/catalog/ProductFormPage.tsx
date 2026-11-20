import ProductImages from '@/components/Catalog/ProductImages';
import VariantEditor from '@/components/Catalog/VariantEditor';
import {
  ConfirmDialog,
  GenericDropdown,
  GenericInputField,
  GenericSwitch,
  GenericTextArea,
} from '@/components/Forms';
import {PageHeader} from '@/components/ui';
import {FormError, FormFooter, FormGroup} from '@/components/ui/FormLayout';
import {
  useBrandOptions,
  useCategoryOptions,
  useProduct,
  useSaveProduct,
  useSetProductStatus,
} from '@/lib/react-query/queriesAndMutations/catalog';
import {useShopOptions} from '@/lib/react-query/queriesAndMutations/org';
import {applyServerErrors} from '@/lib/validation/fieldRules';
import {
  EMPTY_PRODUCT,
  productSchema,
  ProductValues,
  toProductBody,
} from '@/lib/validation/productSchema';
import {CatalogPanel, Product} from '@/types/catalog';
import {PRODUCT_KINDS, ROOM_TYPES} from '@/lib/validation/shopProductSchema';
import {getErrorMessage} from '@/utils/axios';
import {AUTO_RATE, GST_RATES} from '@/lib/api/gst';
import {zodResolver} from '@hookform/resolvers/zod';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {Loader2, Send} from 'lucide-react';
import {useState} from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import ProductStatusBadge from './ProductStatusBadge';

const FIELDS = Object.keys(EMPTY_PRODUCT);
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : v);

const fromProduct = (p: Product): ProductValues => ({
  name: p.name,
  categoryId: p.categoryId,
  shopId: p.shopId ?? '',
  brandId: p.brandId ?? '',
  productKind: p.productKind,
  productType: p.productType ?? '',
  roomType: p.roomType ?? '',
  material: p.material ?? '',
  finish: p.finish ?? '',
  colour: p.colour ?? '',
  warrantyMonths: str(p.warrantyMonths),
  warrantyTerms: p.warrantyTerms ?? '',
  assemblyRequired: p.assemblyRequired,
  installationAvailable: p.installationAvailable,
  isCustomizable: p.isCustomizable,
  wholesalePrice: p.wholesalePrice || '',
  purchasePrice: p.purchasePrice || '',
  mrp: p.mrp,
  sellingPrice: p.sellingPrice,
  taxRate: p.taxRate === null ? AUTO_RATE : String(p.taxRate),
  hsnCode: p.hsnCode ?? '',
  careInstructions: p.careInstructions ?? '',
  shortDesc: p.shortDesc ?? '',
  detailedDesc: p.detailedDesc ?? '',
  tagsText: p.tags.join(', '),
  weightKg: p.weightKg ?? '',
  returnEligible: p.returnEligible,
  returnPeriodDays: p.returnPeriodDays,
  seoTitle: p.seoTitle ?? '',
  seoDesc: p.seoDesc ?? '',
  variants: p.variants.map((v) => ({
    id: v.id,
    variantName: v.variantName,
    finish: v.finish,
    mrp: v.mrp ?? '',
    sellingPrice: v.sellingPrice ?? '',
    wholesalePrice: v.wholesalePrice ?? '',
    isActive: v.isActive,
    available: v.available,
  })),
});

/** The product form (create or edit; read-only when the user cannot edit) */
const ProductForm = ({
  panel,
  product,
  onDone,
}: {
  panel: CatalogPanel;
  product?: Product;
  onDone: (saved: Product) => void;
}) => {
  const readOnly = !!product && !product.canEdit;
  const categories = useCategoryOptions(panel);
  const brands = useBrandOptions(panel);
  // Every product belongs to a branch; it is set once
  const shopList = useShopOptions(
    panel === 'branch-admin' ? 'branch-admin' : 'company-admin',
    undefined,
    panel === 'company-admin' || panel === 'branch-admin',
  );
  const current = product?.shop;
  const shopOptions =
    current && !shopList.data?.some((o) => o.value === current.id)
      ? [{value: current.id, label: current.name}, ...(shopList.data ?? [])]
      : (shopList.data ?? []);
  const save = useSaveProduct(panel);
  const [formError, setFormError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const navigate = useNavigate();
  const toList = () => navigate({to: `/${panel}/products`});

  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? fromProduct(product) : EMPTY_PRODUCT,
    mode: 'onTouched',
  });
  const {
    handleSubmit,
    setError,
    formState: {isSubmitting, isDirty},
  } = form;

  const submit = handleSubmit(async (values) => {
    setFormError('');
    try {
      const res = await save.mutateAsync({
        ...toProductBody(productSchema.parse(values)),
        ...(product ? {id: product.id} : {}),
      });
      onDone(res.data);
    } catch (error) {
      if (!applyServerErrors(error, setError, FIELDS)) {
        setFormError(getErrorMessage(error, 'Could not save the product'));
      }
    }
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <fieldset disabled={readOnly} className="panel space-y-5 p-4 md:p-5">
          <FormGroup title="Product">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
              <GenericInputField
                name="name"
                label="Product Name"
                kind="text"
                required
                autoFocus={!product}
                placeholder="Heritage 6-Seater Dining Set"
                className="sm:col-span-2"
              />
              <GenericDropdown
                name="categoryId"
                label="Category"
                required
                loading={categories.isPending}
                options={categories.data ?? []}
              />
              <GenericDropdown
                name="shopId"
                label="Branch"
                required
                disabled={!!product?.shopId}
                loading={shopList.isPending}
                options={shopOptions}
                hint={
                  product?.shopId
                    ? 'The branch that sells it (set once)'
                    : product
                      ? 'Not in any branch yet: pick one so it can be sold'
                      : 'The branch that stocks and sells it'
                }
              />
              <GenericDropdown
                name="brandId"
                label="Brand"
                placeholder="No brand"
                options={brands.data ?? []}
              />
              <GenericDropdown
                name="productKind"
                label="Product Kind"
                options={PRODUCT_KINDS.map((k) => ({value: k.value, label: k.label}))}
              />
              <GenericInputField
                name="productType"
                label="Product Type"
                kind="text"
                placeholder="Dining Set"
              />
              <GenericInputField
                name="mrp"
                label="MRP"
                kind="price"
                prefix="₹"
                required
                disabled={!!product}
                hint={product ? 'Changed in the branch' : undefined}
              />
              <GenericInputField
                name="sellingPrice"
                label="Selling Price"
                kind="price"
                prefix="₹"
                required
                disabled={!!product}
                hint={product ? 'Changed in the branch' : undefined}
              />
              <GenericInputField name="wholesalePrice" label="Wholesale Price" kind="price" prefix="₹" />
              <GenericInputField name="purchasePrice" label="Purchase Cost" kind="price" prefix="₹" />
            </div>
          </FormGroup>

          <FormGroup title="Variants">
            <VariantEditor disabled={readOnly} lockSavedPrices={!!product} />
          </FormGroup>

          <FormGroup title="Furniture details">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
              <GenericDropdown
                name="roomType"
                label="Room"
                placeholder="Select room (optional)"
                options={ROOM_TYPES.map((r) => ({value: r, label: r}))}
              />
              <GenericInputField name="material" label="Material" kind="text" placeholder="Teak Wood" />
              <GenericInputField name="finish" label="Main Finish" kind="text" placeholder="Walnut" />
              <GenericInputField name="colour" label="Colour" kind="text" placeholder="Brown" />
              <GenericInputField name="warrantyMonths" label="Warranty (months)" kind="quantity" placeholder="12" />
              <GenericTextArea name="warrantyTerms" label="Warranty Terms" rows={2} maxLength={500} className="sm:col-span-1 md:col-span-3" />
              <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3 md:col-span-4">
                <GenericSwitch name="assemblyRequired" label="Needs assembly" />
                <GenericSwitch name="installationAvailable" label="Installation by us" />
                <GenericSwitch name="isCustomizable" label="Made to measure" />
              </div>
              <GenericDropdown
                name="taxRate"
                label="GST"
                hint="Auto uses the branch GST rule; a fixed rate must be one of the branch's slabs"
                options={[
                  {value: AUTO_RATE, label: 'Auto (branch rule)'},
                  ...GST_RATES.map((r) => ({value: String(r), label: `${r}%`})),
                ]}
              />
              <GenericInputField
                name="hsnCode"
                label="HSN Code"
                kind="text"
                placeholder="9403"
                hint="4, 6 or 8 digits; printed on bills and invoices"
                required
              />
              <GenericTextArea
                name="shortDesc"
                label="Short Description"
                rows={2}
                maxLength={300}
                className="sm:col-span-2"
              />
              <GenericTextArea
                name="careInstructions"
                label="Care Instructions"
                rows={2}
                maxLength={300}
                className="sm:col-span-2"
              />
              <GenericTextArea
                name="detailedDesc"
                label="Detailed Description"
                rows={3}
                maxLength={4000}
                className="sm:col-span-2 md:col-span-4"
              />
            </div>
          </FormGroup>

          <FormGroup title="Shipping & search">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
              <GenericInputField
                name="weightKg"
                label="Weight (kg)"
                kind="text"
                inputMode="decimal"
              />
              <GenericInputField
                name="returnPeriodDays"
                label="Return Days"
                kind="quantity"
              />
              <GenericSwitch name="returnEligible" label="Returnable" />
              <GenericInputField
                name="tagsText"
                label="Tags"
                kind="text"
                placeholder="formal, cotton"
                hint="Comma separated"
              />
              <GenericInputField
                name="seoTitle"
                label="SEO Title"
                kind="text"
                maxLength={70}
                className="sm:col-span-2"
              />
              <GenericInputField
                name="seoDesc"
                label="SEO Description"
                kind="text"
                maxLength={160}
                className="sm:col-span-2"
              />
            </div>
          </FormGroup>
        </fieldset>

        {readOnly ? (
          <Link to={`/${panel}/products`} className="btn-ghost">
            Back to products
          </Link>
        ) : (
          <FormFooter
            onCancel={() => (isDirty ? setConfirmLeave(true) : toList())}
            saving={isSubmitting}
            saveLabel={product ? 'Save Changes' : 'Save as Draft'}
          />
        )}

        <ConfirmDialog
          open={confirmLeave}
          title="Discard changes?"
          message="You have unsaved changes on this form. Leaving now will lose them."
          confirmLabel="Discard"
          tone="danger"
          onConfirm={toList}
          onCancel={() => setConfirmLeave(false)}
        />
      </form>
    </FormProvider>
  );
};

/** /<panel>/products/new and /<panel>/products/:productId */
const ProductFormPage = ({panel}: {panel: CatalogPanel}) => {
  const {productId} = useParams({strict: false}) as {productId?: string};
  const navigate = useNavigate();
  const {
    data: product,
    isPending,
    isError,
    error,
  } = useProduct(panel, productId);
  const setStatus = useSetProductStatus(panel);

  const header = (
    <PageHeader
      compact
      breadcrumbs={[
        {label: 'Products', to: `/${panel}/products`},
        {label: productId ? (product?.sku ?? '…') : 'New'},
      ]}
      title={productId ? (product?.name ?? 'Product') : 'Add Product'}
      actions={
        product && (
          <div className="flex items-center gap-2">
            <ProductStatusBadge status={product.status} />
            {product.canPublish && product.status !== 'PUBLISHED' && (
              <button
                type="button"
                className="btn-primary"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({id: product.id, status: 'PUBLISHED'})
                }
              >
                <Send size={14} /> Publish
              </button>
            )}
          </div>
        )
      }
    />
  );

  if (!productId) {
    return (
      <>
        {header}
        <ProductForm
          panel={panel}
          // Continue on the product page to add images and publish
          onDone={(saved) =>
            navigate({
              to: `/${panel}/products/$productId`,
              params: {productId: saved.id},
            })
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {isPending ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 size={16} className="animate-spin" /> Loading product…
        </div>
      ) : isError ? (
        <div className="panel px-6 py-12 text-center">
          <p className="font-serif text-headline-sm text-burgundy">
            Product not available
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {getErrorMessage(error, 'It may have been removed.')}
          </p>
          <Link to={`/${panel}/products`} className="btn-ghost mt-4">
            Back to products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="panel p-4 md:p-5">
            <FormGroup title="Images">
              <ProductImages panel={panel} product={product} />
            </FormGroup>
          </section>
          <ProductForm
            key={product.updatedAt}
            panel={panel}
            product={product}
            onDone={() => undefined}
          />
        </div>
      )}
    </>
  );
};

export default ProductFormPage;
