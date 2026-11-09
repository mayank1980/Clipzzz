/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Mastercard Editorial Design System
        'canvas-cream': '#F3F0EE',
        'lifted-cream': '#FCFBFA',
        'ink-black': '#141413',
        'charcoal': '#262627',
        'signal-orange': '#CF4500',
        'light-orange': '#F37338',
        'clay-brown': '#9A3A0A',
        'soft-bone': '#F4F4F4',
        'slate-gray': '#696969',
        'dust-taupe': '#D1CDC7',
        'border-cream': '#E5E0DB',
        'mc-red': '#EB001B',
        'mc-yellow': '#F79E1B',

        // Legacy compatibility aliases mapped softly to brand palette
        lime: {
          400: '#F37338',
          500: '#CF4500',
          neon: '#CF4500',
          glow: '#F37338',
        },
        dark: {
          950: '#141413',
          900: '#1c1b1a',
          850: '#262627',
          800: '#333230',
          750: '#42413e',
          700: '#52504c',
          600: '#696969',
        }
      },
      borderRadius: {
        'stadium': '40px',
        'hero': '40px',
        'card': '28px',
        'cta': '20px',
      },
      fontFamily: {
        sans: ['"Sofia Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Sofia Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'nav-pill': '0 4px 24px rgba(0, 0, 0, 0.06)',
        'card-soft': '0 16px 40px rgba(20, 20, 19, 0.05)',
        'card-elevated': '0 24px 48px rgba(20, 20, 19, 0.08)',
        'satellite': '0 4px 12px rgba(20, 20, 19, 0.12)',
        'neon': '0 4px 20px rgba(207, 69, 0, 0.25)',
        'neon-sm': '0 2px 10px rgba(207, 69, 0, 0.2)',
      }
    },
  },
  plugins: [],
}
