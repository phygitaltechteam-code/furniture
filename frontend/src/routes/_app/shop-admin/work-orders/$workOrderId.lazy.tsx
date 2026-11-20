import WorkOrderDetailPage from '@/pages/shop/manufacturing/WorkOrderDetailPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/work-orders/$workOrderId')({
  component: WorkOrderDetailPage,
});
