/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand palette: White × Purple ──────────────────────────────
        brand: {
          50:  '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7C3AED',  // ← primary brand purple
          800: '#6D28D9',
          900: '#5B21B6',
          950: '#3B0764',
        },
      },
      boxShadow: {
        'card':      '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(124,58,237,0.06)',
        'card-hover':'0 4px 24px rgba(124,58,237,0.14)',
        'purple':    '0 4px 20px rgba(124,58,237,0.25)',
        'purple-lg': '0 8px 40px rgba(124,58,237,0.30)',
      },
      animation: {
        'fade-up':  'fadeUp 0.3s ease forwards',
        'toast-in': 'toastIn 0.3s ease forwards',
        'scale-in': 'scaleIn 0.2s ease forwards',
      },
      keyframes: {
        fadeUp:  { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        toastIn: { from: { opacity: '0', transform: 'translateX(100%)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.95)' },     to: { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};
