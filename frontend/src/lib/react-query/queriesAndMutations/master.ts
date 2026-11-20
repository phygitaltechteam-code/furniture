import {
  deleteMasterCategory,
  deleteMasterSubcategory,
  getMasterCategories,
  getMasterCategoryOptions,
  getMasterSubcategories,
  MasterParams,
  saveMasterCategory,
  saveMasterSubcategory,
} from '@/lib/api/master';
import {getErrorMessage} from '@/utils/axios';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const MASTER_KEYS = {
  CATEGORIES: 'master-categories',
  CATEGORY_OPTIONS: 'master-category-options',
  SUBCATEGORIES: 'master-subcategories',
};

// ==========================================
// 1. CATEGORIES
// ==========================================

export const useMasterCategories = (params: MasterParams) =>
  useQuery({
    queryKey: [MASTER_KEYS.CATEGORIES, params],
    queryFn: () => getMasterCategories(params).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

export const useMasterCategoryOptions = () =>
  useQuery({
    queryKey: [MASTER_KEYS.CATEGORY_OPTIONS],
    queryFn: () => getMasterCategoryOptions().then((r) => r.data),
  });

export const useSaveMasterCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveMasterCategory,
    onSuccess: (res, vars) => {
      toast.success(
        vars.id
          ? `${res.data.name} updated successfully`
          : `${res.data.name} added successfully`,
      );
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.CATEGORIES]});
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.CATEGORY_OPTIONS]});
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save category'));
    },
  });
};

export const useDeleteMasterCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMasterCategory,
    onSuccess: () => {
      toast.success('Category deleted successfully');
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.CATEGORIES]});
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.CATEGORY_OPTIONS]});
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to delete category'));
    },
  });
};

// ==========================================
// 2. SUBCATEGORIES
// ==========================================

export const useMasterSubcategories = (params: MasterParams, panel?: string) =>
  useQuery({
    queryKey: [MASTER_KEYS.SUBCATEGORIES, params, panel],
    queryFn: () => getMasterSubcategories(params, panel).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

export const useSaveMasterSubcategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveMasterSubcategory,
    onSuccess: (res, vars) => {
      toast.success(
        vars.id
          ? `${res.data.name} updated successfully`
          : `${res.data.name} added successfully`,
      );
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.SUBCATEGORIES]});
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.CATEGORIES]});
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save subcategory'));
    },
  });
};

export const useDeleteMasterSubcategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMasterSubcategory,
    onSuccess: () => {
      toast.success('Subcategory deleted successfully');
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.SUBCATEGORIES]});
      queryClient.invalidateQueries({queryKey: [MASTER_KEYS.CATEGORIES]});
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to delete subcategory'));
    },
  });
};
