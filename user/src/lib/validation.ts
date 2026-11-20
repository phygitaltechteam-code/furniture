import {z} from 'zod';

/*
 * Storefront form rules (zod). Same patterns and messages as the backend
 * (backend/src/validations/custom.validation.ts), so a customer sees the
 * same error before and after the request. The server stays the real check.
 */

export const PATTERNS = {
  name: /^[\p{L} .'-]+$/u,
  phone: /^[6-9]\d{9}$/,
  pincode: /^[1-9]\d{5}$/,
};

const req = (label: string) => z.string({required_error: `${label} is required`}).trim().min(1, `${label} is required`);
const opt = (rule: z.ZodTypeAny) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), rule.optional());

export const rules = {
  name: (label = 'Full Name') =>
    req(label)
      .min(2, `${label} must be at least 2 characters`)
      .max(100, `${label} must be at most 100 characters`)
      .regex(PATTERNS.name, `${label} can only contain letters, spaces, . ' -`),
  email: (label = 'Email Address') => req(label).max(254, `${label} is too long`).email(`Enter a valid ${label}`),
  phone: (label = 'Phone Number') => req(label).regex(PATTERNS.phone, `Enter a valid 10-digit ${label}`),
  pincode: (label = 'Pincode') => req(label).regex(PATTERNS.pincode, `${label} must be a valid 6-digit pincode`),
  text: (label: string, max = 120) => req(label).max(max, `${label} must be at most ${max} characters`),
  optionalText: (label: string, max = 120) => opt(z.string().trim().max(max, `${label} must be at most ${max} characters`)),
  optionalPhone: (label = 'Alternate Phone') => opt(z.string().trim().regex(PATTERNS.phone, `Enter a valid 10-digit ${label}`)),
  optionalEmail: (label = 'Email Address') => opt(z.string().trim().email(`Enter a valid ${label}`)),
  password: (label = 'Password') =>
    z
      .string({required_error: `${label} is required`})
      .min(8, `${label} must be at least 8 characters`)
      .max(128, `${label} must be at most 128 characters`)
      .regex(/[A-Za-z]/, `${label} must contain a letter`)
      .regex(/\d/, `${label} must contain a number`),
};

/** Validate `values`; returns {} when fine, else the first message per field */
export function check<T extends z.ZodTypeAny>(schema: T, values: unknown): Record<string, string> {
  const r = schema.safeParse(values);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/* Schemas per form ----------------------------------------------------------- */

export const signInSchema = z.object({
  username: req('Phone number or email'),
  password: req('Password'),
});

export const signUpSchema = z
  .object({
    fullname: rules.name('Full Name'),
    phoneNumber: rules.phone('Phone Number'),
    email: rules.email('Email Address'),
    password: rules.password(),
    confirmPassword: req('Confirm Password'),
    acceptTerms: z.literal(true, {errorMap: () => ({message: 'You must accept the terms and conditions'})}),
  })
  .refine((v) => v.password === v.confirmPassword, {path: ['confirmPassword'], message: 'Passwords do not match'});

export const forgotSchema = z.object({
  identifier: req('Phone number or email'),
});

export const resetSchema = z
  .object({
    password: rules.password('New Password'),
    confirmPassword: req('Confirm Password'),
  })
  .refine((v) => v.password === v.confirmPassword, {path: ['confirmPassword'], message: 'Passwords do not match'});

export const addressSchema = z.object({
  recipient: rules.name('Full Name'),
  phone: rules.phone('Phone Number'),
  address1: rules.text('Address (house no, building, street)', 200).refine((v) => v.length >= 5, 'Enter the full address'),
  address2: rules.optionalText('Locality / landmark', 200),
  postalCode: rules.pincode(),
  city: rules.text('City', 60),
  district: rules.optionalText('District', 60),
  state: rules.text('State', 60),
  label: z.enum(['HOME', 'WORK', 'OTHER'], {errorMap: () => ({message: 'Choose a label'})}),
});

export const profileSchema = z.object({
  fullname: rules.name('Full Name'),
  email: rules.email('Email Address'),
  alternatePhone: rules.optionalPhone('Alternate Phone'),
});

export const passwordSchema = z
  .object({
    currentPassword: req('Current Password'),
    newPassword: rules.password('New Password'),
    confirmPassword: req('Confirm Password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {path: ['confirmPassword'], message: 'Passwords do not match'})
  .refine((v) => v.newPassword !== v.currentPassword, {path: ['newPassword'], message: 'Choose a password different from the current one'});

export const supportSchema = z.object({
  name: rules.name('Name'),
  email: rules.email(),
  phone: rules.optionalPhone('Phone Number'),
  topic: req('Topic'),
  orderNumber: rules.optionalText('Order number', 40),
  message: rules.text('Message', 1500).refine((v) => v.length >= 10, 'Tell us a little more (at least 10 characters)'),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
  title: rules.optionalText('Title', 80),
  comment: rules.optionalText('Review', 1000),
  images: z.array(z.string()).max(4, 'Up to 4 photos'),
});

export const returnSchema = z
  .object({
    reason: req('Reason'),
    details: rules.optionalText('Details', 500),
    resolution: z.enum(['REFUND', 'EXCHANGE'], {errorMap: () => ({message: 'Choose refund or exchange'})}),
    exchangeFor: rules.optionalText('Replacement wanted', 60),
    items: z.array(z.object({orderItemId: z.string(), quantity: z.number().int().min(1)})).min(1, 'Choose at least one item to return'),
  })
  .refine((v) => v.resolution !== 'EXCHANGE' || !!v.exchangeFor, {
    path: ['exchangeFor'],
    message: 'Tell us the variant or finish you want instead',
  });

/** Typing filter: digits only up to `max` (phones 10, pincode 6); a pasted "+91 98765 43210" keeps the 10 digits */
export const toDigits = (value: string, max: number) => {
  let d = value.replace(/\D/g, '');
  if (max === 10 && d.length > 10 && d.startsWith('91')) d = d.slice(2);
  return d.slice(0, max);
};
