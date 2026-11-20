import QuotationListPage from '@/pages/shop/quotations/QuotationListPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/quotations/')({
  component: QuotationListPage,
});
