import {employeeCanOpen} from '@/lib/shopModules';

/*
 * Exact internal role identifiers:
 * 1. SUPER_ADMIN    = Platform Super Admin (companies, plan limits)
 * 2. ADMIN          = Admin / head office of one company (all branches)
 * 3. BRANCH_MANAGER = Runs one branch: billing, stock, staff, approvals
 * 4. EMPLOYEE       = Staff member (modules they were given)
 * 5. USER           = Store customer
 *
 * The branch screens live under /shop-admin (daily operations) and
 * /branch-admin (approvals, day close, reports); a branch manager opens both.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'BRANCH_MANAGER' | 'EMPLOYEE' | 'USER';

type Landing = {to: string; search?: Record<string, string>};

type RoleConfig = {
  label: string;
  home: string;
  prefix: string;
  /** First page after sign-in, when it is not the home page */
  landing?: Landing;
};

export const ROLES: Record<Role, RoleConfig> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    home: '/super-admin/dashboard',
    prefix: '/super-admin',
  },
  ADMIN: {
    label: 'Admin',
    home: '/company-admin/dashboard',
    prefix: '/company-admin',
    // AppLayout picks: the shop for a single-shop business, else home
    landing: {to: '/'},
  },
  BRANCH_MANAGER: {
    label: 'Branch Manager',
    home: '/shop-admin/dashboard',
    prefix: '/shop-admin',
  },
  EMPLOYEE: {
    label: 'Employee',
    home: '/employee/dashboard',
    prefix: '/employee',
  },
  USER: {
    label: 'Customer',
    home: '/account',
    prefix: '/account',
  },
};

/** Pages every signed-in role may open */
export const SHARED_PATHS = ['/change-password', '/my-profile'];

export const roleConfig = (role?: string | null): RoleConfig | undefined =>
  role && role in ROLES ? ROLES[role as Role] : undefined;

export const homeFor = (role?: string | null) =>
  roleConfig(role)?.home ?? '/signin';

/** Where each role lands right after signing in */
export const landingFor = (role?: string | null): Landing =>
  roleConfig(role)?.landing ?? {to: homeFor(role)};

/** A small business with one shop: shop-first panel, no branch screens */
export const singleShop = (
  me?: {company?: {businessMode?: string} | null} | null,
) => me?.company?.businessMode === 'SINGLE_SHOP';

/** The branch operation screens (/shop-admin/...) */
export const inShopPanel = (path: string) =>
  path === '/shop-admin' || path.startsWith('/shop-admin/');

/** The branch office screens (/branch-admin/...): approvals, day close, reports */
export const inBranchOffice = (path: string) =>
  path === '/branch-admin' || path.startsWith('/branch-admin/');

/**
 * Employees also open the branch screens of the modules they were given;
 * admins open the screens of any of their branches (branch mode)
 */
export const canOpen = (
  role: string | null | undefined,
  path: string,
  permissions: string[] = [],
) => {
  const config = roleConfig(role);
  if (!config) return false;
  if (role === 'EMPLOYEE' && employeeCanOpen(path, permissions)) return true;
  if (role === 'ADMIN' && inShopPanel(path)) return true;
  if (role === 'BRANCH_MANAGER' && inBranchOffice(path)) return true;
  return (
    SHARED_PATHS.includes(path) ||
    path === config.prefix ||
    path.startsWith(`${config.prefix}/`)
  );
};
