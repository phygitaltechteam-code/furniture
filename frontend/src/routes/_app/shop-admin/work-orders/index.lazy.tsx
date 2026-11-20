import WorkOrderListPage from '@/pages/shop/manufacturing/WorkOrderListPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/work-orders/')({
  component: WorkOrderListPage,
});
