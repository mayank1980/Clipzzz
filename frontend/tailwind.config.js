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
        lime: {
          400: '#a3e635',
          500: '#84cc16',
          neon: '#bef264',
          glow: '#d9f99d',
        },
        dark: {
          950: '#07090e',
          900: '#0b0f19',
          850: '#111726',
          800: '#172033',
          700: '#222f47',
          600: '#334155',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon': '0 0 20px -3px rgba(190, 242, 100, 0.35)',
        'neon-sm': '0 0 10px -2px rgba(190, 242, 100, 0.4)',
      }
    },
  },
  plugins: [],
}

