import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // One accent colour (Nexora blue). Green/amber/red are reserved for allowed/escalated/blocked.
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bcd0ff',
          500: '#3366e8',
          600: '#1f4fd6',
          700: '#1a3fae',
          900: '#0d1f57',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans Bengali', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
