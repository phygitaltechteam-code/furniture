import {APP_NAME} from '@/lib/appName';
import {useAuthContext} from '@/context/AuthContext';
import useCurrentUser from '@/hooks/useCurrentUser';
import {SidebarProps} from '@/types';
import {Link, useRouterState} from '@tanstack/react-router';
import {useOwnerShop} from '@/lib/ownerShop';
import {inShopPanel, roleConfig, Role, ROLES} from '@/lib/roles';
import {employeeCanOpen} from '@/lib/shopModules';
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Barcode,
  BookUser,
  Boxes,
  Briefcase,
  Building2,
  CreditCard,
  FileInput,
  FileOutput,
  FileText,
  Hammer,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  Megaphone,
  Monitor,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tag,
  Tags,
  Truck,
  Undo2,
  User,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {ReactNode, useEffect} from 'react';

type NavItem = {label: string; to: string; icon: ReactNode; hint?: string};
type NavGroup = {heading: string; items: NavItem[]};

/** A menu entry; `hint` says in one line what the page is for (tooltip, and shown under the open page) */
const item = (
  label: string,
  to: string,
  Icon: typeof LayoutDashboard,
  hint?: string,
): NavItem => ({
  label,
  to,
  icon: <Icon size={18} strokeWidth={1.5} />,
  hint,
});

const dashboard = (
  to: string,
  hint = 'Today at a glance: sales, money, stock and what needs attention',
): NavGroup => ({
  heading: 'Overview',
  items: [item('Dashboard', to, LayoutDashboard, hint)],
});

// What each role sees, in the order of the day's work; the backend still checks every request
const NAV: Record<Role, NavGroup[]> = {
  SUPER_ADMIN: [
    dashboard(ROLES.SUPER_ADMIN.home, 'Every business on the platform at a glance'),
    {
      heading: 'Businesses',
      items: [
        item('Admins & Plans', '/super-admin/companies', Briefcase, 'Client companies, their admin logins and plan limits'),
        item('Branches', '/super-admin/branches', Building2, 'Every branch of every company'),
        item('Users', '/super-admin/users', Users, 'All logins: block, unblock or reset access'),
      ],
    },
    {
      heading: 'Catalog',
      items: [
        item('Categories', '/super-admin/categories', Tags, 'Platform-wide categories every company can use'),
        item('Brands', '/super-admin/brands', Tag, 'Brands available to companies'),
        item('Products', '/super-admin/products', Package, 'Products of all companies, read only'),
      ],
    },
    {
      heading: 'Online store',
      items: [
        item('Online Orders', '/super-admin/orders', ShoppingBag, 'Website orders across all companies'),
        item('Store Settings', '/super-admin/store-settings', SlidersHorizontal, 'Delivery fees and days, "New" and "Only a few left" badges'),
      ],
    },
  ],
  ADMIN: [
    dashboard(ROLES.ADMIN.home, 'Head office: every branch, sales, stock and plan usage'),
    {
      heading: 'Branches',
      items: [
        item('Work in a Branch', '/shop-admin/dashboard', Store, 'Open one branch: billing, quotations, stock, cash'),
        item('Branches', '/company-admin/branches', Building2, 'Add branches and their branch managers'),
        item('Employees', '/company-admin/employees', Users, 'Staff of every branch'),
        item('Stock Transfers', '/company-admin/stock-transfers', ArrowLeftRight, 'Approve stock moving between branches'),
      ],
    },
    {
      heading: 'Sales',
      items: [
        item('Online Orders', '/company-admin/orders', ShoppingBag, 'Website orders of every branch'),
        item('Offers & Coupons', '/company-admin/promotions', Megaphone, 'Discounts, festival offers and coupon codes'),
      ],
    },
    {
      heading: 'Catalog & stock',
      items: [
        item('Products', '/company-admin/products', Package, 'Furniture, electrical, kitchenware and raw materials'),
        item('Stock', '/company-admin/inventory', Boxes, 'Stock of every product in every branch'),
        item('Brands', '/company-admin/brands', Tag, 'Your brands, used on products'),
      ],
    },
    {
      heading: 'Setup',
      items: [item('Company Profile', '/company-admin/profile', Briefcase, 'Company details on bills, and your plan limits')],
    },
  ],
  BRANCH_MANAGER: [
    {
      heading: 'Overview',
      items: [
        item('Dashboard', ROLES.BRANCH_MANAGER.home, LayoutDashboard, "Today's sales, cash, orders and low stock"),
        item('Approvals', '/branch-admin/approvals', UserCheck, 'Refunds and requests waiting for you'),
      ],
    },
    {
      heading: 'Sales & billing',
      items: [
        item('New Bill (POS)', '/shop-admin/new-bill', Monitor, 'Retail or wholesale bill: scan or search items'),
        item('Quotations', '/shop-admin/quotations', FileText, 'Price quotes for customers; convert to a bill'),
        item('Sales Bills', '/shop-admin/sales-bills', FileOutput, 'All bills: view, print, share, edit or cancel'),
        item('Sales Returns', '/shop-admin/sales-returns', RotateCcw, 'Take items back: refund, exchange or credit note'),
        item('Online Orders', '/shop-admin/orders', ShoppingBag, 'Website orders: confirm, pack, deliver, install'),
      ],
    },
    {
      heading: 'Customers',
      items: [
        item('Customers', '/shop-admin/customers', BookUser, 'Retail, wholesale and online customers'),
        item('Credit & Dues', '/shop-admin/credit', CreditCard, 'Who owes money, and collecting it'),
      ],
    },
    {
      heading: 'Products & stock',
      items: [
        item('Products', '/shop-admin/products', Package, 'Products with photos, variants, finishes and prices'),
        item('Stock', '/shop-admin/inventory', Boxes, 'Finished goods and raw material, by rack'),
        item('Stock Adjustment', '/shop-admin/stock-adjustment', SlidersHorizontal, 'Correct counts, damaged or lost items'),
        item('Stock Transfer', '/shop-admin/stock-transfer', ArrowLeftRight, 'Request or send stock to other branches'),
        item('Barcode Labels', '/shop-admin/barcode-labels', Barcode, 'Print price tags with barcodes'),
      ],
    },
    {
      heading: 'Manufacturing & delivery',
      items: [
        item('Work Orders', '/shop-admin/work-orders', Hammer, 'Raw material → process → QC → stock or customer'),
        item('Deliveries', '/shop-admin/deliveries', Truck, 'Delivery and installation schedule'),
      ],
    },
    {
      heading: 'Purchase',
      items: [
        item('Purchase Bills', '/shop-admin/purchase-bills', FileInput, 'Supplier bills; stock goes up'),
        item('Purchase Return', '/shop-admin/purchase-return', Undo2, 'Send goods back to a supplier'),
        item('Suppliers', '/shop-admin/suppliers', Truck, 'Suppliers, what you owe them and payments'),
      ],
    },
    {
      heading: 'Accounts',
      items: [
        item('Cash Book', '/shop-admin/cash-book', Wallet, 'Cash in and out of the counter'),
        item('Day Close & Bank', '/branch-admin/day-close', Landmark, 'Close the day and record bank deposits'),
        item('Expenses', '/shop-admin/expenses', Receipt, 'Rent, transport, repairs and other costs'),
        item('Reports', '/shop-admin/reports', BarChart3, 'Sales, profit & loss and GST of the branch'),
      ],
    },
    {
      heading: 'Team',
      items: [
        item('Employees', '/shop-admin/employees', Users, 'Staff logins and which modules each can use'),
        item('Staff & Attendance', '/shop-admin/staff', UserCog, 'Attendance, shifts and rights'),
      ],
    },
    {
      heading: 'Setup',
      items: [
        item('Branch Profile', '/branch-admin/profile', Building2, 'Branch address, timings and holidays'),
        item('GST Settings', '/shop-admin/gst-settings', Percent, 'GST rate rule and the slabs you use'),
      ],
    },
  ],
  // Employees: built from the branch menu and their module access (see below)
  EMPLOYEE: [],
  USER: [{heading: 'Account', items: [item('My Account', ROLES.USER.home, User)]}],
};

/** Head office working inside one branch also manages the company-wide masters */
const OWNER_MASTERS: NavGroup = {
  heading: 'Company masters',
  items: [
    item('Categories', '/shop-admin/categories', Tags, 'Furniture, Electronics, Crockery, Raw Materials…'),
    item('Subcategories', '/shop-admin/subcategories', Layers, 'Types inside a category, like Sofas or Beds'),
  ],
};

const ACCOUNT_GROUP: NavGroup = {
  heading: 'Settings',
  items: [
    item(
      'Change Password',
      '/change-password',
      KeyRound,
      'Change your own login password',
    ),
  ],
};

const Sidebar = ({sidebarOpen, setSidebarOpen}: SidebarProps) => {
  const {role} = useAuthContext();
  const config = roleConfig(role);
  const {data: me} = useCurrentUser();
  const pathname = useRouterState({select: (st) => st.location.pathname});
  const isOpen = (to: string) =>
    pathname === to || pathname.startsWith(`${to}/`);
  // Company admin working in one of their shops
  const ownerShop = useOwnerShop(me?.id);
  const shopMode = role === 'ADMIN' && inShopPanel(pathname);

  // Under the brand: the role, and the branch the account works in
  const place =
    role === 'BRANCH_MANAGER' || role === 'EMPLOYEE'
      ? (me?.branch?.name ?? me?.shop?.name)
      : shopMode
        ? ownerShop?.name
        : null;
  const panelLabel = [config?.label, place].filter(Boolean).join(' · ');

  // An employee sees the branch screens of the modules they were given
  const employeeNav: NavGroup[] =
    role === 'EMPLOYEE'
      ? [
          {heading: 'Me', items: [item('My Work', ROLES.EMPLOYEE.home, User)]},
          ...NAV.BRANCH_MANAGER.map((g) => ({
            ...g,
            items: g.items.filter((i) =>
              employeeCanOpen(i.to, me?.permissions),
            ),
          })).filter((g) => g.items.length),
        ]
      : [];
  // Working in a branch, the admin gets the branch menu, the company masters and a way back
  const shopModeNav: NavGroup[] = [
    {
      heading: 'Head office',
      items: [item('Back to head office', ROLES.ADMIN.home, ArrowLeft, 'Leave this branch')],
    },
    ...NAV.BRANCH_MANAGER.map((g) => ({
      ...g,
      // Branch-office pages belong to the branch manager's own login
      items: g.items.filter((i) => !i.to.startsWith('/branch-admin/')),
    })),
    OWNER_MASTERS,
  ];
  const roleNav =
    role === 'EMPLOYEE'
      ? employeeNav
      : shopMode
        ? shopModeNav
        : (NAV[role as Role] ?? []);
  const nav = [...roleNav, ACCOUNT_GROUP].filter((g) => g.items.length);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && setSidebarOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen, setSidebarOpen]);

  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-[60] bg-scrim backdrop-blur-[2px] transition-opacity lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-[70] flex w-[17rem] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text shadow-5 transition-transform duration-300 lg:static lg:w-64 lg:translate-x-0 lg:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-4">
          <Link
            to={config?.home ?? '/'}
            className="block min-w-0"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brass font-sans text-base font-bold text-walnut-900">
                {APP_NAME.charAt(0)}
              </span>
              {APP_NAME}
            </span>
            <span className="mt-1.5 block truncate text-[10px] font-bold uppercase tracking-wider text-brass">
              {panelLabel}
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {nav.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-muted">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((navItem) => (
                  <li key={navItem.to}>
                    <Link
                      to={navItem.to}
                      onClick={() => setSidebarOpen(false)}
                      title={navItem.hint}
                      className="group flex items-start gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-sidebar-text transition-colors duration-150 hover:bg-sidebar-hover hover:text-white"
                      activeProps={{
                        className:
                          '!bg-sidebar-active !text-white font-semibold shadow-[inset_3px_0_0_0_#C08A3E]',
                      }}
                    >
                      <span className="mt-px flex-shrink-0 text-sidebar-icon transition-colors duration-150 group-hover:text-white">
                        {navItem.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{navItem.label}</span>
                        {/* What this page is for, under the page that is open */}
                        {navItem.hint && isOpen(navItem.to) && (
                          <span className="mt-0.5 block whitespace-normal text-[11px] font-normal leading-snug text-sidebar-muted">
                            {navItem.hint}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="border-t border-sidebar-border px-5 py-3 text-[11px] font-medium text-sidebar-muted">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </aside>
    </>
  );
};

export default Sidebar;
