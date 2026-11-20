/** @type {import('tailwindcss').Config} */
/*
 * FurniPro storefront theme: walnut primary, brass accent, cream canvas,
 * charcoal ink. Token names (brand, canvas, ink, line, gold, ok) are what
 * the components use, so only the values live here.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {DEFAULT: '#5B3A29', dark: '#3F271B', soft: '#F1E7DF'},
        canvas: '#F7F3EE',
        ink: {DEFAULT: '#1F1D1B', soft: '#5F5A55', faint: '#9A948E'},
        line: '#E7DFD6',
        gold: '#C08A3E',
        brass: {DEFAULT: '#C08A3E', deep: '#8E6224', soft: '#F6EBD9'},
        ok: '#2E7D4F',
        warn: '#B7791F',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      maxWidth: {page: '1240px'},
      boxShadow: {
        card: '0 1px 2px rgba(63,39,27,0.06), 0 4px 16px -6px rgba(63,39,27,0.12)',
      },
    },
  },
  plugins: [],
};
