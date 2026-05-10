import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        twn: {
          50: '#eef6fa',
          100: '#d5eaf4',
          200: '#afd6ea',
          300: '#7ebddb',
          400: '#4a9fc8',
          500: '#2e84af',
          600: '#246a92',
          700: '#1f5577',
          800: '#1d475f',
          900: '#1b3c51',
        },
        meena: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        status: {
          completed: '#22c55e',
          inProgress: '#3b82f6',
          delayed: '#ef4444',
          onHold: '#9ca3af',
          dependent: '#f97316',
        },
      },
    },
  },
  plugins: [],
};

export default config;
