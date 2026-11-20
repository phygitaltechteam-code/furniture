import {
  useMasterCategoryOptions,
  useMasterSubcategories,
} from '@/lib/react-query/queriesAndMutations/master';
import {useBrandOptions} from '@/lib/react-query/queriesAndMutations/catalog';

const ALL_ACTIVE = {page: 1, limit: 100, active: 'true'} as const;

/**
 * Categories, subcategories (of the picked category) and brands for the
 * product form and filters. Employees call the same /shop-admin API (the
 * axios client sends it to /employee for them).
 */
const useProductMasters = (categoryId?: string) => {
  const categories = useMasterCategoryOptions();
  const subcategories = useMasterSubcategories({
    ...ALL_ACTIVE,
    sortBy: 'name',
    sortDir: 'asc',
    categoryId: categoryId || undefined,
  });
  const brands = useBrandOptions('shop-admin');

  return {
    categories: categories.data ?? [],
    subcategories: subcategories.data?.items ?? [],
    /** {value, label} options */
    brands: brands.data ?? [],
    loading: {
      categories: categories.isPending,
      subcategories: subcategories.isPending,
      brands: brands.isPending,
    },
  };
};

export default useProductMasters;
