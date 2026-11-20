import QuotationFormPage from '@/pages/shop/quotations/QuotationFormPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/quotations/new')({
  component: QuotationFormPage,
});
