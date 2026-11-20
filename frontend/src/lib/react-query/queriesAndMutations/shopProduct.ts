import {
  deleteShopProduct,
  deleteShopProductImage,
  getShopProduct,
  getShopProducts,
  saveShopProduct,
  updateShopProductImage,
  uploadShopProductImages,
} from '@/lib/api/shopProduct';
import {ShopProduct, ShopProductParams} from '@/types/shopProduct';
import {getErrorMessage} from '@/utils/axios';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const SHOP_PRODUCT_KEYS = {
  PRODUCTS: 'shop-products',
  PRODUCT: 'shop-product',
};

const errorToast = (fallback: string) => (error: unknown) =>
  toast.error(getErrorMessage(error, fallback));

/** Refresh the list; put a fresh detail straight into the cache */
const useRefresh = () => {
  const queryClient = useQueryClient();
  return (product?: ShopProduct) => {
    queryClient.invalidateQueries({queryKey: [SHOP_PRODUCT_KEYS.PRODUCTS]});
    if (product) {
      queryClient.setQueryData(
        [SHOP_PRODUCT_KEYS.PRODUCT, product.id],
        product,
      );
    } else {
      queryClient.invalidateQueries({queryKey: [SHOP_PRODUCT_KEYS.PRODUCT]});
    }
  };
};

export const useShopProducts = (params: ShopProductParams) =>
  useQuery({
    queryKey: [SHOP_PRODUCT_KEYS.PRODUCTS, params],
    queryFn: () => getShopProducts(params).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

export const useShopProduct = (id?: string) =>
  useQuery({
    queryKey: [SHOP_PRODUCT_KEYS.PRODUCT, id],
    queryFn: () => getShopProduct(id as string).then((r) => r.data),
    enabled: !!id,
  });

export const useSaveShopProduct = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: saveShopProduct,
    onSuccess: (res, vars) => {
      toast.success(
        vars.id
          ? `${res.data.name} updated successfully`
          : `${res.data.name} added successfully`,
      );
      refresh(res.data);
    },
    onError: errorToast('Failed to save product'),
  });
};

export const useDeleteShopProduct = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: deleteShopProduct,
    onSuccess: () => {
      toast.success('Product deleted successfully');
      refresh();
    },
    onError: errorToast('Failed to delete product'),
  });
};

export const useShopProductImages = (productId: string) => {
  const refresh = useRefresh();
  const done = (res: {message: string; data: ShopProduct}) => {
    toast.success(res.message);
    refresh(res.data);
  };
  return {
    upload: useMutation({
      mutationFn: (files: File[]) => uploadShopProductImages(productId, files),
      onSuccess: done,
      onError: errorToast('Could not upload the images'),
    }),
    setMain: useMutation({
      mutationFn: (imageId: string) =>
        updateShopProductImage(productId, imageId, {isMain: true}),
      onSuccess: done,
      onError: errorToast('Could not update the image'),
    }),
    remove: useMutation({
      mutationFn: (imageId: string) =>
        deleteShopProductImage(productId, imageId),
      onSuccess: done,
      onError: errorToast('Could not remove the image'),
    }),
  };
};
