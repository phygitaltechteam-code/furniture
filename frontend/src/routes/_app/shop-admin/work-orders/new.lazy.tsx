import WorkOrderFormPage from '@/pages/shop/manufacturing/WorkOrderFormPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/work-orders/new')({
  component: WorkOrderFormPage,
});
