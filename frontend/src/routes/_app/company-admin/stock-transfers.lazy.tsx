import BranchStockTransfersPage from '@/pages/branch/BranchStockTransfersPage';
import {createLazyFileRoute} from '@tanstack/react-router';

const HeadOfficeTransfers = () => <BranchStockTransfersPage panel="company-admin" />;

export const Route = createLazyFileRoute('/_app/company-admin/stock-transfers')({
  component: HeadOfficeTransfers,
});
