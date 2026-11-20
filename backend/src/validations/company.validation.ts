import {z} from 'zod';
import {BusinessMode, CompanyStatus} from '@prisma/client';
import {field} from './custom.validation';
import {listQuerySchema} from '../utils/list';

/** A plan limit: whole number 1..max (form data sends it as text) */
const limit = (label: string, max: number) =>
    z.coerce
        .number({invalid_type_error: `Enter a valid ${label}`})
        .int(`${label} must be a whole number`)
        .min(1, `${label} must be at least 1`)
        .max(max, `${label} can be at most ${max}`);

/** A switch sent as JSON boolean or form text */
const flag = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

// Labels match the Company form, so API errors read the same as the UI.
// The company code is not here: the backend generates it on create.
const companyBodySchema = z.object({
    name: field({label: 'Company Name', kind: 'text'}),
    email: field({label: 'Company Email', kind: 'email'}),
    contactNumber: field({label: 'Contact Number', kind: 'phone'}),
    postalCode: field({label: 'Pincode', kind: 'pincode'}),
    state: field({label: 'State', kind: 'text', max: 60}),
    district: field({label: 'District', kind: 'text', max: 60}),
    city: field({label: 'City', kind: 'text', max: 60}),
    address: field({label: 'Address', kind: 'text', max: 500}),
    country: field({label: 'Country', kind: 'text', max: 60, required: false}).transform(
        (v) => v ?? 'India',
    ),
    adminName: field({label: 'Admin Full Name', kind: 'name'}),
    adminEmail: field({label: 'Admin Email', kind: 'email'}),
    adminPhone: field({label: 'Admin Phone Number', kind: 'phone'}),
    // Sign-in password for the company admin; stored hashed on their User
    adminPassword: field({label: 'Admin Password', kind: 'password'}),
    status: z.nativeEnum(CompanyStatus).default(CompanyStatus.ACTIVE),
    // Omitted: new companies get the database default (BRANCHES)
    businessMode: z.nativeEnum(BusinessMode).optional(),
    // Plan limits set by the super admin
    maxBranches: limit('Max Branches', 500).default(3),
    maxEmployees: limit('Max Employees', 10_000).default(25),
    maxProducts: limit('Max Products', 100_000).default(2000),
    ecommerceEnabled: flag.default(true),
    manufacturingEnabled: flag.default(true),
    // Sent as "true" by the edit form to clear the existing logo
    removeLogo: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
});

const createCompanySchema = companyBodySchema;
// On edit a blank password keeps the current one; limits not sent are kept
const updateCompanySchema = companyBodySchema
    .extend({
        maxBranches: limit('Max Branches', 500),
        maxEmployees: limit('Max Employees', 10_000),
        maxProducts: limit('Max Products', 100_000),
        ecommerceEnabled: flag,
        manufacturingEnabled: flag,
    })
    .partial();

const COMPANY_SORT_FIELDS = ['createdAt', 'name', 'code', 'city', 'status'] as const;

const listCompaniesSchema = listQuerySchema(COMPANY_SORT_FIELDS, 'createdAt').extend({
    status: z.nativeEnum(CompanyStatus).optional(),
});

const companyIdSchema = z.object({id: z.string().uuid('Invalid company id')});

export default {
    createCompanySchema,
    updateCompanySchema,
    listCompaniesSchema,
    companyIdSchema,
};
