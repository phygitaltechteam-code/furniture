import {Link, useNavigate} from '@tanstack/react-router';
import {Heart, ShieldCheck} from 'lucide-react';
import {useAuth} from '@/lib/auth';
import {useToggleWishlist, useWishlistIds} from '@/lib/queries';
import type {ProductCard as Card} from '@/lib/types';
import {Badge, Price, ProductVisual, RatingChip} from './ui';

export function WishlistHeart({productId, className = ''}: {productId: string; className?: string}) {
  const {signedIn} = useAuth();
  const navigate = useNavigate();
  const {data: ids} = useWishlistIds();
  const toggle = useToggleWishlist();
  const saved = !!ids?.includes(productId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!signedIn) {
          navigate({to: '/signin', search: {redirect: window.location.pathname + window.location.search}});
          return;
        }
        toggle.mutate({productId, saved});
      }}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      aria-pressed={saved}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition hover:scale-105 ${className}`}
    >
      <Heart size={16} className={saved ? 'fill-brand text-brand' : 'text-ink-soft'} />
    </button>
  );
}

/** "3 Seater · 2 Seater" or "3 finishes" — what the shopper can choose */
const optionsText = (p: Card) => {
  const parts: string[] = [];
  if (p.variantNames.length > 1) parts.push(`${p.variantNames.length} sizes`);
  else if (p.variantNames[0] && p.variantNames[0] !== 'Standard') parts.push(p.variantNames[0]);
  if (p.finishes.length > 1) parts.push(`${p.finishes.length} finishes`);
  else if (p.finishes[0]) parts.push(p.finishes[0]);
  return parts.join(' · ');
};

export default function ProductCard({p}: {p: Card}) {
  const options = optionsText(p);
  return (
    <Link
      to="/product/$id"
      params={{id: p.slug ?? p.id}}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className={`relative aspect-square overflow-hidden bg-canvas ${p.inStock ? '' : 'opacity-60'}`}>
        <ProductVisual image={p.image} name={p.name} className="transition duration-500 group-hover:scale-[1.03]" />
        {p.hoverImage && (
          <img
            src={p.hoverImage}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100"
          />
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          <Badge kind={p.badge} />
          {p.isCustomizable && p.badge !== 'OUT_OF_STOCK' && <Badge kind="CUSTOM" />}
        </div>
        <WishlistHeart productId={p.id} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 md:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          {p.brand}
          {p.material && <span className="normal-case tracking-normal"> · {p.material}</span>}
        </p>
        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{p.name}</p>
        {options && <p className="line-clamp-1 text-xs text-ink-soft">{options}</p>}
        <div className="mt-1">
          <Price price={p.price} mrp={p.mrp} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <RatingChip avg={p.rating.avg} count={p.rating.count} />
          {!!p.warrantyMonths && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft" title="Manufacturer warranty">
              <ShieldCheck size={12} className="text-ok" />
              {p.warrantyMonths >= 12 ? `${Math.round(p.warrantyMonths / 12)} yr` : `${p.warrantyMonths} mo`}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({items, cols = 'lg:grid-cols-4'}: {items: Card[]; cols?: string}) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 ${cols}`}>
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}
