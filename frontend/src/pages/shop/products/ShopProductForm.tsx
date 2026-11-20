import {
  ConfirmDialog,
  GenericDropdown,
  GenericInputField,
  GenericSwitch,
  GenericTextArea,
} from '@/components/Forms';
import {FurnitureVariants, SpecificationsEditor} from '@/components/ShopProduct/FurnitureVariants';
import {PendingImages, ShopProductImages} from '@/components/ShopProduct/ShopProductImages';
import useProductMasters from '@/components/ShopProduct/useProductMasters';
import {PageHeader} from '@/components/ui';
import {FormError, FormFooter, FormGroup} from '@/components/ui/FormLayout';
import {useSaveShopProduct, useShopProduct} from '@/lib/react-query/queriesAndMutations/shopProduct';
import {applyServerErrors} from '@/lib/validation/fieldRules';
import {
  EMPTY_SHOP_PRODUCT,
  fromShopProduct,
  PRODUCT_KINDS,
  ROOM_TYPES,
  shopProductSchema,
  ShopProductValues,
  toShopProductBody,
  UNITS,
} from '@/lib/validation/shopProductSchema';
import {SHOP_PRODUCT_STATUSES, ShopProduct} from '@/types/shopProduct';
import {getErrorMessage} from '@/utils/axios';
import {AUTO_RATE} from '@/lib/api/gst';
import {useGstRule} from '@/lib/react-query/queriesAndMutations/gst';
import {zodResolver} from '@hookform/resolvers/zod';
import {Link, useNavigate, useParams} from '@tanstack/react-router';
import {Loader2} from 'lucide-react';
import {useState} from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import {StockBadge} from './ShopProductList';

// Fields a server error can be shown on (lists and nested rows go to the form error)
const FIELDS = Object.keys(EMPTY_SHOP_PRODUCT).filter((f) => !['variants', 'specifications'].includes(f));
const label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

const Form = ({product}: {product?: ShopProduct}) => {
  const navigate = useNavigate();
  const save = useSaveShopProduct();
  const {data: gstRule} = useGstRule();
  const [formError, setFormError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const form = useForm<ShopProductValues>({
    resolver: zodResolver(shopProductSchema),
    defaultValues: product ? fromShopProduct(product) : EMPTY_SHOP_PRODUCT,
    mode: 'onTouched',
  });
  const {
    handleSubmit,
    setError,
    watch,
    formState: {isSubmitting, isDirty},
  } = form;
  const categoryId = watch('categoryId');
  const productKind = watch('productKind');
  const forSale = productKind === 'FINISHED_GOOD';
  const masters = useProductMasters(categoryId);

  const toDetail = (id: string) => navigate({to: '/shop-admin/products/$productId', params: {productId: id}});
  const leave = () => (product ? toDetail(product.id) : navigate({to: '/shop-admin/products'}));

  const submit = handleSubmit(
    async (values) => {
      setFormError('');
      try {
        const res = await save.mutateAsync({
          ...toShopProductBody(shopProductSchema.parse(values), !product),
          ...(product ? {id: product.id} : {files}),
        });
        toDetail(res.data.id);
      } catch (error) {
        if (!applyServerErrors(error, setError, FIELDS)) {
          setFormError(getErrorMessage(error, 'Could not save the product'));
        }
      }
    },
    () => setFormError('Some fields need attention. Check the highlighted fields below.'),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <div className="panel space-y-6 p-4 md:p-6">
          <p className="rounded-md border border-brass/30 bg-brass-soft/60 px-3 py-2 text-sm text-espresso">
            Fields marked <span className="font-semibold text-error">*</span> are required: name, description,
            category, MRP, HSN code and at least one variant. Everything else can be added later.
          </p>

          <FormGroup title="Product" description="What the customer sees, and whether it is sold or used in manufacturing.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <GenericInputField
                name="name"
                label="Product Name"
                kind="text"
                required
                autoFocus={!product}
                placeholder="Aspen 3-Seater Fabric Sofa"
                className="sm:col-span-2"
              />
              <GenericInputField
                name="sku"
                label="SKU"
                kind="code"
                maxLength={40}
                placeholder="Auto-generated if blank"
                hint="Your own product code."
              />
              <GenericDropdown
                name="productKind"
                label="Product Kind"
                required
                options={PRODUCT_KINDS.map((k) => ({value: k.value, label: k.label}))}
                hint="Only finished products are sold online."
              />
              <GenericDropdown
                name="businessLine"
                label="Business Line"
                required
                options={[
                  {value: 'FURNITURE', label: 'Furniture'},
                  {value: 'ELECTRONICS', label: 'Electronics'},
                  {value: 'CROCKERY', label: 'Crockery & utensils'},
                ]}
              />
              <GenericDropdown
                name="sourcing"
                label="How we get it"
                required
                options={[
                  {value: 'TRADED', label: 'Traded: buy and sell'},
                  {value: 'MANUFACTURED', label: 'Manufactured in our workshop'},
                  {value: 'MADE_TO_ORDER', label: 'Made to order for the customer'},
                ]}
                hint="Workshop-made furniture gets a bill of materials and work orders."
              />
              <GenericTextArea
                name="detailedDesc"
                label="Description"
                required
                rows={4}
                maxLength={4000}
                placeholder="Wood, construction, comfort, what makes it special…"
                className="sm:col-span-2 lg:col-span-4"
              />
              <GenericTextArea
                name="shortDesc"
                label="Short Description"
                hint="Optional one-line summary shown on product cards."
                rows={2}
                maxLength={300}
                className="sm:col-span-2 lg:col-span-4"
              />
              <GenericDropdown
                name="status"
                label="Status"
                hint="Draft: saved only. Published: on the online store."
                options={SHOP_PRODUCT_STATUSES.map((s) => ({value: s, label: label(s)}))}
              />
            </div>
          </FormGroup>

          <FormGroup title="Classification" description="Where the product shows up in menus, filters and reports.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <GenericDropdown
                name="categoryId"
                label="Category"
                required
                placeholder="Select category"
                loading={masters.loading.categories}
                options={masters.categories.map((c) => ({value: c.id, label: c.name}))}
                hint={
                  !masters.loading.categories && !masters.categories.length
                    ? 'No categories yet. Head office adds them under Company masters.'
                    : 'Furniture, Electrical, Kitchenware or Raw Materials.'
                }
              />
              <GenericDropdown
                name="subcategoryId"
                label="Subcategory"
                dependsOn="categoryId"
                disabled={!categoryId}
                placeholder={categoryId ? 'None (optional)' : 'Select a category first'}
                loading={!!categoryId && masters.loading.subcategories}
                options={categoryId ? masters.subcategories.map((s) => ({value: s.id, label: s.name})) : []}
                hint="e.g. Sofas, Beds, Ceiling Fans."
              />
              <GenericDropdown
                name="brandId"
                label="Brand"
                placeholder="None (optional)"
                loading={masters.loading.brands}
                options={masters.brands}
              />
              <GenericInputField name="productType" label="Product Type" kind="text" placeholder="Sofa" hint="e.g. Sofa, Bed, Wardrobe." />
              {forSale && (
                <GenericDropdown
                  name="roomType"
                  label="Room"
                  placeholder="Select room (optional)"
                  options={ROOM_TYPES.map((r) => ({value: r, label: r}))}
                  hint="Used for 'Branch by room' on the store."
                />
              )}
              <GenericInputField name="material" label="Material" kind="text" placeholder="Sheesham Wood" />
              <GenericInputField name="finish" label="Main Finish" kind="text" placeholder="Walnut" />
              <GenericInputField name="colour" label="Colour" kind="text" placeholder="Brown" />
            </div>
          </FormGroup>

          <FormGroup
            title="Variants"
            description="Each variant (configuration + finish) gets its own SKU, barcode and stock. Leave prices blank to use the product's prices."
          >
            <FurnitureVariants isNew={!product} />
            {product && (
              <div className="mt-4">
                <p className="field-label">Stock now</p>
                <StockBadge qty={product.stock} />
                <p className="field-hint">Add stock with a purchase bill; correct it with a stock adjustment.</p>
              </div>
            )}
          </FormGroup>

          <FormGroup title="Pricing & tax" description="MRP is the tag price. Selling and wholesale prices apply at the POS and online.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <GenericInputField name="mrp" label="MRP" kind="price" prefix="₹" required />
              <GenericInputField name="sellingPrice" label="Selling Price" kind="price" prefix="₹" hint="Blank = same as MRP" />
              <GenericInputField name="wholesalePrice" label="Wholesale Price" kind="price" prefix="₹" hint="For dealers and bulk bills" />
              <GenericInputField name="purchasePrice" label="Purchase Cost" kind="price" prefix="₹" hint="Used for profit reports" />
              <GenericDropdown
                name="taxRate"
                label="GST"
                hint="Auto follows your branch GST rule."
                options={[
                  {value: AUTO_RATE, label: gstRule ? `Auto: ${gstRule.summary}` : 'Auto (branch rule)'},
                  ...(gstRule?.slabs ?? [0, 5, 12, 18, 28]).map((r) => ({value: String(r), label: `${r}%`})),
                ]}
              />
              <GenericInputField name="hsnCode" label="HSN Code" kind="text" placeholder="9403" hint="Furniture 9401/9403, fans 8414" required />
              <GenericDropdown name="unit" label="Unit" required options={UNITS.map((u) => ({value: u.value, label: u.label}))} />
            </div>
          </FormGroup>

          <FormGroup title="Dimensions & specifications" description="Shown on the product page; help customers check it fits their space.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
              <GenericInputField name="lengthCm" label="Length (cm)" kind="price" placeholder="210" />
              <GenericInputField name="widthCm" label="Width / Depth (cm)" kind="price" placeholder="90" />
              <GenericInputField name="heightCm" label="Height (cm)" kind="price" placeholder="85" />
            </div>
            <div className="mt-4">
              <p className="field-label">Specifications</p>
              <SpecificationsEditor />
            </div>
          </FormGroup>

          <FormGroup title="Warranty, delivery & custom orders" description="What the customer gets after buying.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <GenericInputField name="warrantyMonths" label="Warranty (months)" kind="quantity" placeholder="12" />
              <GenericTextArea name="warrantyTerms" label="Warranty Terms" rows={2} maxLength={500} className="sm:col-span-1 lg:col-span-3" placeholder="Covers manufacturing defects; not physical damage or termites." />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <GenericSwitch name="assemblyRequired" label="Needs assembly" description="Customer or our team assembles it" />
              <GenericSwitch name="installationAvailable" label="Installation by us" description="Our team installs at delivery" />
              <GenericSwitch name="isCustomizable" label="Made to measure" description="Can be ordered in custom size / finish" />
            </div>
          </FormGroup>

          <FormGroup title="More details" description="All optional.">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <GenericInputField name="tagsText" label="Tags" kind="text" placeholder="sofa, living room, fabric" hint="Comma separated; used in search" />
              <GenericTextArea name="careInstructions" label="Care Instructions" rows={2} maxLength={300} placeholder="Wipe with a soft dry duster; avoid direct sunlight." />
            </div>
          </FormGroup>

          <FormGroup title="Photos" description="Up to 8 photos; the first is the main one. Use a plain background for the best results.">
            {product ? <ShopProductImages product={product} /> : <PendingImages files={files} onChange={setFiles} />}
          </FormGroup>
        </div>

        <FormFooter
          onCancel={() => (isDirty || files.length ? setConfirmLeave(true) : leave())}
          saving={isSubmitting}
          saveLabel={product ? 'Save Changes' : 'Save Product'}
        />

        <ConfirmDialog
          open={confirmLeave}
          title="Discard changes?"
          message="You have unsaved changes on this form. Leaving now will lose them."
          confirmLabel="Discard"
          tone="danger"
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        />
      </form>
    </FormProvider>
  );
};

/** /shop-admin/products/new and /shop-admin/products/edit/:productId */
const ShopProductForm = () => {
  const {productId} = useParams({strict: false}) as {productId?: string};
  const {data: product, isPending, isError, error} = useShopProduct(productId);

  const header = (
    <PageHeader
      compact
      breadcrumbs={[{label: 'Products', to: '/shop-admin/products'}, {label: productId ? (product?.sku ?? '…') : 'New'}]}
      title={productId ? `Edit ${product?.name ?? 'Product'}` : 'Add Product'}
    />
  );

  if (!productId) {
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
        // Images save on their own; keep the form state across those updates
        <Form key={product.id} product={product} />
      )}
    </>
  );
};

export default ShopProductForm;
