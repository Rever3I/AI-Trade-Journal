/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './extension/src/**/*.{js,jsx}',
    './extension/*.html',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fb',
          400: '#36adf6',
          500: '#0c93e7',
          600: '#0074c5',
          700: '#015da0',
          800: '#064f84',
          900: '#0b426e',
        },
        surface: {
          bg: '#0f1419',
          card: '#1a2332',
          border: '#2a3a4e',
          hover: '#243347',
        },
        score: {
          high: '#22c55e',
          mid: '#eab308',
          low: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans SC"', 'sans-serif'],
      },
      width: {
        panel: '400px',
      },
    },
  },
  plugins: [],
};
