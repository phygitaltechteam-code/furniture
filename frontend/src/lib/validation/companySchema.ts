import {z} from 'zod';
import {field} from './fieldRules';

// Same labels and rules as backend/src/validations/company.validation.ts.
// No code field: the backend generates the company code on create.
export const companySchema = z.object({
  name: field({label: 'Company Name', kind: 'text'}),
  email: field({label: 'Company Email', kind: 'email'}),
  contactNumber: field({label: 'Contact Number', kind: 'phone'}),
  postalCode: field({label: 'Pincode', kind: 'pincode'}),
  state: field({label: 'State', kind: 'text', max: 60}),
  district: field({label: 'District', kind: 'text', max: 60}),
  city: field({label: 'City', kind: 'text', max: 60}),
  address: field({label: 'Address', kind: 'text', max: 500}),
  adminName: field({label: 'Admin Full Name', kind: 'name'}),
  adminEmail: field({label: 'Admin Email', kind: 'email'}),
  adminPhone: field({label: 'Admin Phone Number', kind: 'phone'}),
  status: z.enum(['ACTIVE', 'INACTIVE'], {
    errorMap: () => ({message: 'Status is required'}),
  }),
  // Plan limits the super admin sets for this admin
  maxBranches: field({label: 'Max Branches', kind: 'quantity'})
    .refine((v) => v >= 1, 'Max Branches must be at least 1')
    .refine((v) => v <= 500, 'Max Branches can be at most 500'),
  maxEmployees: field({label: 'Max Employees', kind: 'quantity'})
    .refine((v) => v >= 1, 'Max Employees must be at least 1')
    .refine((v) => v <= 10000, 'Max Employees can be at most 10000'),
  maxProducts: field({label: 'Max Products', kind: 'quantity'})
    .refine((v) => v >= 1, 'Max Products must be at least 1')
    .refine((v) => v <= 100000, 'Max Products can be at most 100000'),
  ecommerceEnabled: z.boolean(),
  manufacturingEnabled: z.boolean(),
  // Company admin's sign-in password: required on create, blank on edit
  // keeps the current one
  adminPassword: field({label: 'Admin Password', kind: 'password'}),
});

export const editCompanySchema = companySchema.extend({
  adminPassword: field({
    label: 'Admin Password',
    kind: 'password',
    required: false,
  }),
});

export type CompanySchema = z.infer<typeof editCompanySchema>;

export const EMPTY_COMPANY: CompanySchema = {
  name: '',
  email: '',
  contactNumber: '',
  postalCode: '',
  state: '',
  district: '',
  city: '',
  address: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  status: 'ACTIVE',
  maxBranches: 3,
  maxEmployees: 25,
  maxProducts: 2000,
  ecommerceEnabled: true,
  manufacturingEnabled: true,
  adminPassword: '',
};

export const COMPANY_FIELDS = Object.keys(EMPTY_COMPANY);
