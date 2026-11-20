import {refusedShopId, useSwitchShop} from '@/lib/ownerShop';
import {useShopOptions} from '@/lib/react-query/queriesAndMutations/org';
import {getErrorMessage} from '@/utils/axios';
import {Link} from '@tanstack/react-router';
import {Loader2, Store} from 'lucide-react';
import {ReactNode, useEffect} from 'react';

const Panel = ({title, children}: {title: string; children: ReactNode}) => (
  <div className="panel mx-auto mt-8 max-w-md p-8 text-center">
    <Store size={28} strokeWidth={1.5} className="mx-auto text-burgundy" />
    <h1 className="mt-3 font-serif text-headline-sm text-burgundy">{title}</h1>
    {children}
  </div>
);

/** Admin on a branch screen with no branch open: pick the branch to work in */
const OwnerShopPicker = ({userId}: {userId: string}) => {
  const {
    data: shops,
    isPending,
    isError,
    error,
    refetch,
  } = useShopOptions('company-admin');
  const switchShop = useSwitchShop();
  const refused = refusedShopId();
  // One branch: open it straight away, unless the
  // server just refused it
  const only =
    shops?.length === 1 && shops[0].value !== refused ? shops[0] : null;

  useEffect(() => {
    if (only) switchShop({userId, id: only.value, name: only.label});
  }, [only, userId, switchShop]);

  if (isPending || only) {
    return (
      <div className="flex justify-center py-16">
        <Loader2
          className="animate-spin text-burgundy"
          aria-label="Opening your branch"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <Panel title="Could not load your branches">
        <p className="mt-2 text-body-sm text-on-surface-variant">
          {getErrorMessage(error, 'Please try again.')}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-primary mt-6"
        >
          Try again
        </button>
      </Panel>
    );
  }

  if (!shops.length) {
    return (
      <Panel title="Add a branch first">
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Your company has no open branch yet. Add one, then come back here to
          work in it.
        </p>
        <Link to="/company-admin/branches" className="btn-primary mt-6">
          Go to Branches
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title="Choose the branch you want to work in">
      {refused && (
        <p className="mt-2 text-body-sm text-error" role="alert">
          That branch is closed or no longer in your company. Pick another branch.
        </p>
      )}
      <ul className="mt-6 space-y-2">
        {shops.map((shop) => (
          <li key={shop.value}>
            <button
              type="button"
              onClick={() =>
                switchShop({userId, id: shop.value, name: shop.label})
              }
              className="btn-ghost w-full whitespace-normal"
            >
              {shop.label}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

export default OwnerShopPicker;
