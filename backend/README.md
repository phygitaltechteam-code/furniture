# FurniPro - Backend

Express 5 + Prisma (PostgreSQL) API for FurniPro, a furniture ERP and online store:
multi-branch billing, inventory, quotations, purchases and the customer storefront.

## Setup

Requirements: Node 20+ and PostgreSQL 16 (local install, or Docker:
`docker run --name furnipro-db -e POSTGRES_PASSWORD=<password> -p 5432:5432 -d postgres:16`).

```bash
cd backend
cp .env.example .env          # then fill in DATABASE_URL, JWT_SECRET, CORS_ORIGINS
npm install
npx prisma generate
npx prisma migrate deploy     # creates all tables
npm run create:superadmin -- --email <you> --phone <10 digits> --password <8+ chars>
npm run seed:demo             # optional: a demo furniture company with branches, products and sales
npm run dev                   # http://localhost:5800/api/v1
```

The admin panel (`frontend/`) and the store (`user/`) read the API address from
`VITE_SERVER_URL=http://localhost:5800/api/v1` in their `.env` files.

Never commit `.env`. Every variable is documented in `.env.example`.

## Roles

| Role | Panel | Scope |
| --- | --- | --- |
| `SUPER_ADMIN` | Super Admin | The platform: companies (admins), their plan limits, store settings |
| `ADMIN` | Admin (head office) | One company: branches, employees, catalog, transfers between branches, reports |
| `BRANCH_MANAGER` | Branch | One branch: POS, quotations, stock, purchases, staff, accounts |
| `EMPLOYEE` | Branch (by module) | The modules their permissions allow |
| `USER` | Store | Customer account on the storefront |

Each branch has one internal outlet record that billing, the cash drawer and staff
are scoped to. It is created with the branch and is never shown as a separate level.

Plan limits (`Company.maxBranches`, `maxEmployees`, `maxProducts`,
`ecommerceEnabled`, `manufacturingEnabled`) are set by the super admin and checked
by `limitService` on every create.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with reload (ts-node-dev) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run lint` | ESLint |
| `npm run create:superadmin` | Create or reset the super admin and sync its permissions |
| `npm run seed:demo` | Demo furniture company (`-- --replace` to rebuild it) |
| `npm run prisma:migrate:dev` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run prisma:migrate:deploy` | Apply committed migrations |

## Conventions for new modules

- **Validation**: build every field rule with `field({label, kind})` from
  `src/validations/custom.validation.ts`. Errors use the field's label
  ("Business Email is required"). Mirror of `frontend/src/lib/validation/fieldRules.ts`.
- **Lists**: use `listQuerySchema`, `searchWhere`, `listArgs`, `toListResult`
  from `src/utils/list.ts`. Response: `{items, pagination: {page, limit, total, totalPages}}`.
- **Permissions**: add new permission strings to `src/config/permissions.ts`
  (SUPERADMIN gets them on the next start) and guard routes with
  `checkPermission('module.action')` after `verifyJWT`.
- **Audit log**: call `auditService.log({...auditService.fromRequest(req), action, module, targetId, before, after})`
  for every important change. The table is append-only; secrets are stripped automatically.
