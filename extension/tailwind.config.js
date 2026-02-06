/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,ts,tsx,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1a1a2e',
          secondary: '#16213e',
          tertiary: '#0f3460',
        },
        accent: {
          DEFAULT: '#e94560',
          hover: '#ff6b6b',
        },
        profit: '#00c853',
        loss: '#ff1744',
        text: {
          primary: '#e0e0e0',
          secondary: '#9e9e9e',
          muted: '#616161',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      width: {
        panel: '400px',
      },
    },
  },
  plugins: [],
};
