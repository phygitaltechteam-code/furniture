import QuotationDetailPage from '@/pages/shop/quotations/QuotationDetailPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/quotations/$quotationId')({
  component: QuotationDetailPage,
});
