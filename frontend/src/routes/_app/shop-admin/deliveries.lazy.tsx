import DeliveriesPage from '@/pages/shop/manufacturing/DeliveriesPage';
import {createLazyFileRoute} from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_app/shop-admin/deliveries')({
  component: DeliveriesPage,
});
