import {PATTERNS} from '@/lib/validation/fieldRules';

/*
 * Typing filters and checks for plain <input>s that are not built with the
 * Generic form fields (POS, bill modals, quick-add dialogs). Same rules and
 * messages as fieldRules / the backend, so a field behaves the same everywhere.
 */

/** Digits only, at most 10; a pasted "+91 98765 43210" becomes "9876543210" */
export const toPhone = (value: string) => {
  let d = value.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
};

/** Letters, spaces and . ' - only (people's names) */
export const toPersonName = (value: string) =>
  value.replace(/[^\p{L} .'-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 100);

/** Customer / supplier names may be businesses: letters, digits and & . , ' - ( ) / */
export const toPartyName = (value: string) =>
  value.replace(/[^\p{L}\p{N} .,&'()/-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, 120);

/** GSTIN: 15 upper-case letters / digits */
export const toGstin = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);

/** Digits only up to `max` (pincode 6, PIN 4…) */
export const toDigits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/** Props for a 10-digit mobile input */
export const phoneInputProps = {
  inputMode: 'numeric' as const,
  maxLength: 10,
  autoComplete: 'tel',
  pattern: '[6-9][0-9]{9}',
};

export const phoneError = (value: string, label = 'Phone Number', required = false): string | null => {
  const v = value.trim();
  if (!v) return required ? `${label} is required` : null;
  return PATTERNS.phone.test(v) ? null : `${label} must be a valid 10-digit mobile number starting with 6, 7, 8 or 9`;
};

export const nameError = (value: string, label = 'Name', required = false): string | null => {
  const v = value.trim();
  if (!v) return required ? `${label} is required` : null;
  if (v.length < 2) return `${label} must be at least 2 characters`;
  if (!/\p{L}/u.test(v)) return `${label} must contain letters`;
  return null;
};

export const gstinError = (value: string, label = 'GSTIN', required = false): string | null => {
  const v = value.trim();
  if (!v) return required ? `${label} is required` : null;
  return PATTERNS.gstin.test(v) ? null : `Enter a valid ${label} (15 characters, e.g. 27ABCDE1234F1Z5)`;
};
