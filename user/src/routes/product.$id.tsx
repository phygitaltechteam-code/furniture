import {useEffect, useMemo, useState} from 'react';
import {createFileRoute, Link, useNavigate} from '@tanstack/react-router';
import {Check, Hammer, Minus, Plus, Ruler, ShieldCheck, Truck, Wrench} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {api, errorMessage} from '@/lib/api';
import {useAuth} from '@/lib/auth';
import {useAddToCart, useProduct} from '@/lib/queries';
import {dimsText, inr, shortDate, warrantyText} from '@/lib/format';
import type {Coupon, ProductDetail, Variant} from '@/lib/types';
import {ProductGrid, WishlistHeart} from '@/components/ProductCard';
import {btn, Empty, ErrorBox, Price, ProductVisual, SectionTitle, Spinner, Stars} from '@/components/ui';

export const Route = createFileRoute('/product/$id')({component: ProductPage});

/** "10% off (up to ₹3,000) on orders above ₹25,000", or the store's own wording */
const offerText = (c: Coupon) => {
  if (c.description) return c.description;
  const off = c.type === 'PERCENTAGE' ? `${c.discountValue}% off` : `${inr(c.discountValue)} off`;
  const cap = c.type === 'PERCENTAGE' && c.maxDiscountLimit ? ` (up to ${inr(c.maxDiscountLimit)})` : '';
  const min = c.minPurchaseAmount > 0 ? ` on orders above ${inr(c.minPurchaseAmount)}` : '';
  return `${off}${cap}${min}`;
};

const TABS = ['Description', 'Dimensions & specs', 'Warranty & care', 'Delivery & returns'] as const;
const ATTR_LABEL: Record<string, string> = {productType: 'Type', room: 'Room', material: 'Material', finish: 'Finish', colour: 'Colour', unit: 'Sold per'};

function DeliveryCheck() {
  const [pin, setPin] = useState('');
  const [checked, setChecked] = useState('');
  const [pinError, setPinError] = useState('');
  const {data, error, isFetching} = useQuery({
    queryKey: ['delivery', checked],
    queryFn: () =>
      api.get<{standard: {by: string; freeAbove: number; feeBelow: number}; express: {by: string; fee: number}; cod: boolean; returns: string}>(
        `/store/delivery/${checked}`,
      ),
    enabled: checked.length === 6,
    retry: false,
  });
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink">Check delivery</p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const v = pin.trim();
          if (!/^[1-9]\d{5}$/.test(v)) {
            setPinError('Enter a valid 6-digit pincode');
            return;
          }
          setPinError('');
          setChecked(v);
        }}
        className="flex"
      >
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="Enter pincode"
          aria-label="Pincode"
          aria-invalid={!!pinError}
          className="min-h-[42px] w-full min-w-0 flex-1 rounded-l-md border border-r-0 border-line px-3 text-sm focus:border-brand focus:outline-none"
        />
        <button className="shrink-0 rounded-r-md border border-brand px-4 text-sm font-semibold text-brand hover:bg-brand-soft" disabled={isFetching}>
          Check
        </button>
      </form>
      {pinError && <p className="mt-2 text-xs text-red-700">{pinError}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{errorMessage(error)}</p>}
      {data && (
        <ul className="mt-3 space-y-1.5 text-xs text-ink-soft">
          <li className="flex gap-1.5">
            <Check size={14} className="shrink-0 text-ok" /> Delivery by <strong className="text-ink">{data.standard.by}</strong> · free above {inr(data.standard.freeAbove)}
          </li>
          <li className="flex gap-1.5">
            <Check size={14} className="shrink-0 text-ok" /> Express by {data.express.by} for {inr(data.express.fee)}
          </li>
          {data.cod && (
            <li className="flex gap-1.5">
              <Check size={14} className="shrink-0 text-ok" /> Cash on delivery available · {data.returns}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** One row of option buttons (configuration or finish) */
function OptionRow({
  title,
  value,
  options,
  onPick,
  photoOf,
  available,
}: {
  title: string;
  value: string;
  options: string[];
  onPick: (v: string) => void;
  photoOf?: (v: string) => string | null | undefined;
  available: (v: string) => boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink">
        {title}: <span className="font-normal normal-case tracking-normal text-ink-soft">{value || 'Choose one'}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o === value;
          const photo = photoOf?.(o);
          const ok = available(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onPick(o)}
              aria-pressed={on}
              title={ok ? o : `${o} · out of stock`}
              className={`flex min-h-[42px] items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-sm transition ${
                on ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-white text-ink-soft hover:border-ink-faint'
              } ${ok ? '' : 'opacity-50'}`}
            >
              {photo && <img src={photo} alt="" loading="lazy" className="h-8 w-8 rounded object-cover" />}
              <span className={ok ? '' : 'line-through'}>{o}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const firstInStock = (p: ProductDetail) => p.variants.find((v) => v.stock > 0) ?? p.variants[0];

function ProductPage() {
  const {id} = Route.useParams();
  const {data: p, isLoading, error, refetch} = useProduct(id);
  const {signedIn} = useAuth();
  const navigate = useNavigate();
  const add = useAddToCart();

  const [config, setConfig] = useState('');
  const [finish, setFinish] = useState('');
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Description');
  // Photo picked from the thumbnails (null = the chosen finish's photo)
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [finish, p?.id]);

  useEffect(() => {
    if (p) {
      const first = firstInStock(p);
      setConfig(first?.variantName ?? '');
      setFinish(first?.finish ?? '');
      setQty(1);
    }
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const configs = useMemo(() => [...new Set(p?.variants.map((v) => v.variantName) ?? [])], [p]);
  const finishes = useMemo(() => [...new Set(p?.variants.map((v) => v.finish) ?? [])], [p]);
  const find = (c: string, f: string): Variant | undefined => p?.variants.find((v) => v.variantName === c && v.finish === f);
  const chosen = find(config, finish);

  if (isLoading) return <Spinner />;
  if (error || !p) {
    return error && (error as {response?: {status?: number}}).response?.status === 404 ? (
      <Empty title="This product is not available" text="It may have been sold out or removed." action={<Link to="/products" className={btn.primary}>Keep shopping</Link>} />
    ) : (
      <ErrorBox message={errorMessage(error)} retry={() => refetch()} />
    );
  }

  // Picking a configuration keeps the finish when that pair exists, else the first finish it comes in
  const pickConfig = (c: string) => {
    setConfig(c);
    if (!find(c, finish)) setFinish(p.variants.find((v) => v.variantName === c && v.stock > 0)?.finish ?? p.variants.find((v) => v.variantName === c)?.finish ?? '');
  };
  const pickFinish = (f: string) => {
    setFinish(f);
    if (!find(config, f)) setConfig(p.variants.find((v) => v.finish === f && v.stock > 0)?.variantName ?? p.variants.find((v) => v.finish === f)?.variantName ?? '');
  };

  const finishPhoto = (f: string) => p.variants.find((v) => v.finish === f && v.image)?.image;
  const gallery = [...new Set([chosen?.image, ...p.images.map((img) => img.url)].filter((u): u is string => !!u))].slice(0, 8);
  const mainImage = picked && gallery.includes(picked) ? picked : gallery[0];
  const totalStock = p.variants.reduce((t, v) => t + v.stock, 0);
  const maxQty = Math.min(chosen?.stock ?? 0, 10);

  const addToBag = (thenBag = false) => {
    if (!signedIn) {
      navigate({to: '/signin', search: {redirect: `/product/${id}`}});
      return;
    }
    if (!chosen || chosen.stock === 0) return;
    add.mutate({variantId: chosen.id, quantity: qty}, {onSuccess: () => thenBag && navigate({to: '/bag'})});
  };

  const attrs = Object.entries(p.attributes).filter(([, v]) => v);
  const dims = dimsText(p.dimensions);
  const warranty = warrantyText(p.warranty.months);
  const showConfig = configs.length > 1 || (configs[0] && configs[0] !== 'Standard');

  return (
    <div className="space-y-10">
      <nav className="text-xs text-ink-faint" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-brand">
          Home
        </Link>
        {p.attributes.room && (
          <>
            {' / '}
            <Link to="/products" search={{room: p.attributes.room}} className="hover:text-brand">
              {p.attributes.room}
            </Link>
          </>
        )}
        {p.subcategory && (
          <>
            {' / '}
            <Link to="/products" search={{subcategory: p.subcategory}} className="hover:text-brand">
              {p.subcategory}
            </Link>
          </>
        )}
        {' / '}
        <span className="text-ink-soft">{p.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Gallery */}
        <div className="space-y-3 lg:sticky lg:top-36 lg:self-start">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-canvas">
            <ProductVisual image={mainImage} name={p.name} iconSize={90} />
            <WishlistHeart productId={p.id} className="absolute right-3 top-3 !h-10 !w-10" />
            {p.isCustomizable && (
              <span className="absolute left-3 top-3 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-white">Made to measure</span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {gallery.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPicked(url)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={url === mainImage}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition sm:h-20 sm:w-20 ${url === mainImage ? 'border-brand' : 'border-line hover:border-ink-faint'}`}
                >
                  <ProductVisual image={url} name={`${p.name} view ${i + 1}`} iconSize={16} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy box */}
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{p.brand}</p>
            <h1 className="mt-1 font-serif text-[28px] leading-tight text-ink sm:text-3xl">{p.name}</h1>
            {p.shortDesc && <p className="mt-2 text-sm text-ink-soft">{p.shortDesc}</p>}
            {p.rating.count > 0 && (
              <a href="#reviews" className="mt-2 inline-flex items-center gap-2 py-1.5 text-xs text-ink-soft hover:text-brand">
                <span className="rounded bg-ok px-1.5 py-0.5 font-semibold text-white">{p.rating.avg.toFixed(1)} ★</span>
                {p.rating.count} rating{p.rating.count === 1 ? '' : 's'}
              </a>
            )}
          </div>

          <div>
            <Price price={chosen?.price ?? p.price} mrp={chosen?.mrp ?? p.mrp} size="lg" />
            <p className="mt-1 text-xs text-ink-faint">
              Inclusive of all taxes · sold by {p.shop.name}, {p.shop.city}
            </p>
          </div>

          {showConfig && (
            <OptionRow
              title="Size / configuration"
              value={config}
              options={configs}
              onPick={pickConfig}
              available={(c) => p.variants.some((v) => v.variantName === c && v.stock > 0)}
            />
          )}
          <OptionRow
            title="Finish"
            value={finish}
            options={finishes}
            onPick={pickFinish}
            photoOf={finishPhoto}
            available={(f) => p.variants.some((v) => v.finish === f && (v.variantName === config || !showConfig) && v.stock > 0)}
          />

          {/* Quick facts */}
          <ul className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
            {dims && (
              <li className="flex items-center gap-2 rounded-lg bg-white p-2.5 ring-1 ring-line">
                <Ruler size={15} className="shrink-0 text-brand" /> {dims}
              </li>
            )}
            {warranty && (
              <li className="flex items-center gap-2 rounded-lg bg-white p-2.5 ring-1 ring-line">
                <ShieldCheck size={15} className="shrink-0 text-ok" /> {warranty} warranty
              </li>
            )}
            {p.installationAvailable && (
              <li className="flex items-center gap-2 rounded-lg bg-white p-2.5 ring-1 ring-line">
                <Hammer size={15} className="shrink-0 text-brand" /> Free installation
              </li>
            )}
            {p.assemblyRequired && !p.installationAvailable && (
              <li className="flex items-center gap-2 rounded-lg bg-white p-2.5 ring-1 ring-line">
                <Wrench size={15} className="shrink-0 text-brand" /> Easy self-assembly
              </li>
            )}
          </ul>

          {/* Availability + add */}
          <div>
            {totalStock === 0 ? (
              <p className="text-sm font-semibold text-red-700">Out of stock</p>
            ) : !chosen || chosen.stock === 0 ? (
              <p className="text-sm font-semibold text-red-700">This combination is out of stock. Try another finish or size.</p>
            ) : chosen.stock <= 3 ? (
              <p className="text-sm font-semibold text-warn">Only {chosen.stock} left in this finish</p>
            ) : (
              <p className="text-sm text-ok">In stock</p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center justify-between rounded-md border border-line bg-white sm:justify-start">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-3" aria-label="Fewer" disabled={qty <= 1}>
                <Minus size={14} />
              </button>
              <span className="w-10 text-center text-sm" aria-live="polite">
                {qty}
              </span>
              <button onClick={() => setQty((q) => Math.min(maxQty || 1, q + 1))} className="p-3" aria-label="More" disabled={qty >= maxQty}>
                <Plus size={14} />
              </button>
            </div>
            <button onClick={() => addToBag()} disabled={!chosen || chosen.stock === 0 || add.isPending} className={`${btn.outline} flex-1`}>
              {add.isPending ? 'Adding…' : 'Add to bag'}
            </button>
            <button onClick={() => addToBag(true)} disabled={!chosen || chosen.stock === 0 || add.isPending} className={`${btn.primary} flex-1`}>
              Buy now
            </button>
          </div>
          {add.isSuccess && (
            <Link to="/bag" className="flex items-center justify-center gap-2 rounded-md border border-ok/30 bg-ok/5 py-2 text-sm text-ok">
              <Check size={15} /> Added · Go to bag
            </Link>
          )}

          {p.offers.length ? (
            <div className="rounded-xl border border-dashed border-gold bg-brass-soft/60 p-4 text-sm">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink">Offers</p>
              <ul className="space-y-1 text-ink-soft">
                {p.offers.map((c) => (
                  <li key={c.code}>
                    • {offerText(c)}: use <strong className="text-ink">{c.code}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-faint">Enter the code in your bag before you pay. One code per order.</p>
            </div>
          ) : null}

          <DeliveryCheck />
          <p className="flex items-center gap-2 text-xs text-ink-soft">
            <Truck size={14} /> Ships from our {p.shop.city} showroom
          </p>
        </div>
      </div>

      {/* Details tabs */}
      <section className="rounded-2xl border border-line bg-white">
        <div className="no-scrollbar flex overflow-x-auto border-b border-line" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap px-5 py-3.5 text-sm font-semibold ${tab === t ? 'border-b-2 border-brand text-brand' : 'text-ink-soft hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-5 text-sm text-ink-soft md:p-6">
          {tab === 'Description' && (
            <div className="grid gap-6 md:grid-cols-2">
              <p className="whitespace-pre-line leading-relaxed">{p.description}</p>
              {attrs.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {attrs.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-ink-faint">{ATTR_LABEL[k] ?? k}</dt>
                      <dd className="text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          {tab === 'Dimensions & specs' && (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.dimensions.lengthCm && (
                <div>
                  <dt className="text-xs text-ink-faint">Length × Width × Height</dt>
                  <dd className="text-ink">{dims ?? `${p.dimensions.lengthCm} cm long`}</dd>
                </div>
              )}
              {p.weightKg && (
                <div>
                  <dt className="text-xs text-ink-faint">Weight</dt>
                  <dd className="text-ink">{p.weightKg} kg</dd>
                </div>
              )}
              {p.specifications.map((s) => (
                <div key={s.key}>
                  <dt className="text-xs text-ink-faint">{s.key}</dt>
                  <dd className="text-ink">{s.value}</dd>
                </div>
              ))}
              {!dims && !p.weightKg && p.specifications.length === 0 && <p>Specifications will be added soon. Ask us for details.</p>}
            </dl>
          )}
          {tab === 'Warranty & care' && (
            <div className="space-y-3">
              <p>
                <strong className="text-ink">Warranty: </strong>
                {warranty ? `${warranty}. ${p.warranty.terms ?? 'Covers manufacturing defects.'}` : 'No manufacturer warranty on this item.'}
              </p>
              <p>
                <strong className="text-ink">Care: </strong>
                {p.careInstructions ?? 'Dust with a soft dry cloth. Keep away from direct sunlight, heat and moisture.'}
              </p>
            </div>
          )}
          {tab === 'Delivery & returns' && (
            <div className="space-y-3">
              <p>
                <strong className="text-ink">Delivery: </strong>
                Our own delivery team brings it to your room of choice.{' '}
                {p.installationAvailable
                  ? 'Installation is done on delivery at no extra cost.'
                  : p.assemblyRequired
                    ? 'Comes flat-packed with an easy assembly guide.'
                    : 'Arrives fully assembled.'}
              </p>
              <p>
                <strong className="text-ink">Returns: </strong>
                {p.returnEligible
                  ? `Returns within ${p.returnPeriodDays} days of delivery if the item is damaged or defective. Request it from My orders.`
                  : p.isCustomizable
                    ? 'Made-to-measure pieces cannot be returned, but are covered by the warranty.'
                    : 'This item cannot be returned. Damage on delivery is replaced free.'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" className="grid grid-cols-1 gap-6 rounded-2xl border border-line bg-white p-5 md:grid-cols-[260px_minmax(0,1fr)] md:p-6">
        <div>
          <h2 className="font-serif text-2xl">Ratings & reviews</h2>
          {p.rating.count ? (
            <>
              <p className="mt-2 text-4xl font-semibold">
                {p.rating.avg.toFixed(1)} <span className="text-xl text-gold">★</span>
              </p>
              <p className="text-xs text-ink-faint">
                {p.rating.count} rating{p.rating.count === 1 ? '' : 's'}
              </p>
              <div className="mt-3 space-y-1">
                {p.rating.distribution.map((d) => (
                  <div key={d.star} className="flex items-center gap-2 text-xs">
                    <span className="w-6">{d.star}★</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-canvas">
                      <span className="block h-full bg-brand" style={{width: `${(d.count / p.rating.count) * 100}%`}} />
                    </span>
                    <span className="w-5 text-right text-ink-faint">{d.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">No ratings yet.</p>
          )}
          <p className="mt-4 text-xs text-ink-faint">Only verified buyers can review. Review your purchases from My reviews.</p>
        </div>
        <div className="divide-y divide-line">
          {p.reviews.length === 0 && <p className="text-sm text-ink-soft">Be the first to review this after your order arrives.</p>}
          {p.reviews.map((r) => (
            <article key={r.id} className="py-3 first:pt-0">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                {r.title && <p className="text-sm font-semibold">{r.title}</p>}
              </div>
              {r.comment && <p className="mt-1 text-sm text-ink-soft">{r.comment}</p>}
              {!!r.images?.length && (
                <div className="mt-2 flex gap-2">
                  {r.images.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt={`Photo from ${r.author}`} loading="lazy" className="h-16 w-16 rounded border border-line object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-ink-faint">
                {r.author} · Verified buyer · {shortDate(r.createdAt)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {p.similar.length > 0 && (
        <section>
          <SectionTitle title="You may also like" />
          <ProductGrid items={p.similar.slice(0, 4)} />
        </section>
      )}
    </div>
  );
}
