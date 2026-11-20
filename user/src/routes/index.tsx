import {useState} from 'react';
import {createFileRoute, Link} from '@tanstack/react-router';
import {Hammer, Ruler, ShieldCheck, Truck} from 'lucide-react';
import {useHome} from '@/lib/queries';
import {inr} from '@/lib/format';
import {ProductGrid} from '@/components/ProductCard';
import {btn, ErrorBox, ProductVisual, SectionTitle, Spinner} from '@/components/ui';
import {errorMessage} from '@/lib/api';
import type {Coupon, ProductCard} from '@/lib/types';

export const Route = createFileRoute('/')({component: HomePage});

const couponTitle = (c: Coupon) =>
  c.name ?? (c.type === 'PERCENTAGE' ? `${c.discountValue}% off` : `${inr(c.discountValue)} off`);

const PROMISES = [
  {icon: Truck, title: 'Free delivery', text: 'To your room of choice, on eligible orders'},
  {icon: Hammer, title: 'Expert installation', text: 'Our team assembles it at home'},
  {icon: ShieldCheck, title: 'Up to 5-year warranty', text: 'Against manufacturing defects'},
  {icon: Ruler, title: 'Made to measure', text: 'Sizes and finishes built to order'},
];

type Tab = 'bestsellers' | 'newArrivals' | 'deals';
const TABS: {key: Tab; label: string}[] = [
  {key: 'bestsellers', label: 'Bestsellers'},
  {key: 'newArrivals', label: 'New in'},
  {key: 'deals', label: 'Best deals'},
];

function HomePage() {
  const {data, isLoading, error, refetch} = useHome();
  const [tab, setTab] = useState<Tab>('bestsellers');

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox message={errorMessage(error)} retry={() => refetch()} />;

  const hero: ProductCard[] = (data.bestsellers.length ? data.bestsellers : data.newArrivals).slice(0, 3);
  const picks = data[tab];

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="relative grid items-center gap-8 overflow-hidden rounded-2xl bg-brand-dark p-6 text-white md:grid-cols-2 md:p-12">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Crafted for Indian homes</p>
          <h1 className="mt-3 font-serif text-[34px] leading-[1.1] sm:text-5xl">Furniture that feels like home</h1>
          <p className="mt-4 max-w-md text-[15px] text-white/80">
            Solid-wood sofas, beds, dining sets and storage, built in our own workshop and delivered with care
            {data.cities.length ? ` from our showrooms in ${data.cities.join(', ')}` : ''}.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/products" className={`${btn.primary} !bg-gold hover:!bg-brass-deep`}>
              Shop all furniture
            </Link>
            <Link to="/products" search={{customizable: true}} className={`${btn.outline} !border-white/60 !text-white hover:!bg-white/10`}>
              Made to measure
            </Link>
          </div>
        </div>
        {hero.length > 0 && (
          <div className="relative z-10 grid h-72 grid-cols-2 grid-rows-2 gap-3 sm:h-80">
            {hero.map((p, i) => (
              <Link
                key={p.id}
                to="/product/$id"
                params={{id: p.slug ?? p.id}}
                className={`group overflow-hidden rounded-xl bg-canvas ${i === 0 ? 'row-span-2' : ''}`}
                aria-label={p.name}
              >
                <ProductVisual image={p.image} name={p.name} className="transition duration-500 group-hover:scale-105" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Promises */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {PROMISES.map(({icon: Icon, title, text}) => (
          <div key={title} className="flex items-start gap-3 rounded-xl border border-line bg-white p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Icon size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Shop by room */}
      {data.rooms.length > 0 && (
        <section>
          <SectionTitle title="Shop by room" sub="Everything you need, room by room" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.rooms.map((r) => (
              <Link
                key={r.name}
                to="/products"
                search={{room: r.name}}
                className="group overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-card"
              >
                <div className="aspect-square overflow-hidden bg-canvas">
                  <ProductVisual image={r.image} name={r.name} className="transition duration-500 group-hover:scale-105" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-ink-faint">
                    {r.count} {r.count === 1 ? 'piece' : 'pieces'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Picks */}
      <section>
        <SectionTitle
          title="Our picks for you"
          action={
            <div className="flex gap-1 rounded-full border border-line bg-white p-1" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`min-h-[34px] rounded-full px-3.5 text-xs font-semibold transition ${tab === t.key ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          }
        />
        {picks.length ? (
          <ProductGrid items={picks.slice(0, 8)} />
        ) : (
          <p className="py-10 text-center text-sm text-ink-soft">Nothing here yet.</p>
        )}
      </section>

      {/* Coupons */}
      {data.coupons.length > 0 && (
        <section className="grid gap-4 md:grid-cols-3">
          {data.coupons.slice(0, 3).map((c, i) => (
            <div
              key={c.code}
              className={`rounded-xl p-6 ${i === 0 ? 'bg-brand text-white' : i === 1 ? 'bg-brass-soft text-ink' : 'border border-line bg-white text-ink'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Offer</p>
              <p className="mt-1 font-serif text-2xl">{couponTitle(c)}</p>
              {c.description && <p className="mt-1 text-sm opacity-90">{c.description}</p>}
              <p className="mt-3 text-sm">
                Use code{' '}
                <strong className="rounded border border-dashed border-current px-2 py-0.5 tracking-wider">{c.code}</strong>
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Made to measure */}
      {data.customizable.length > 0 && (
        <section className="rounded-2xl bg-brass-soft p-5 md:p-8">
          <SectionTitle
            title="Made to measure"
            sub="Pick the size, wood and finish; our workshop builds it for you"
            action={
              <Link to="/products" search={{customizable: true}} className={btn.ghost}>
                View all
              </Link>
            }
          />
          <ProductGrid items={data.customizable.slice(0, 4)} />
        </section>
      )}

      {/* Categories */}
      {data.categories.length > 0 && (
        <section>
          <SectionTitle title="Browse by category" />
          <div className="flex flex-wrap gap-2">
            {data.categories.map((c) => (
              <Link
                key={c.name}
                to="/products"
                search={{category: c.name}}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-line bg-white px-4 text-sm text-ink transition hover:border-brand hover:text-brand"
              >
                {c.name} <span className="text-xs text-ink-faint">{c.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
