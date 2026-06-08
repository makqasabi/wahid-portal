import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Refined cool-neutral (premium slate tone) — overrides default gray
        // app-wide so every existing gray-* usage inherits the new palette.
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Tawuniya — refined teal-blue brand ramp
        twn: {
          50: '#f0f7fb',
          100: '#dbecf5',
          200: '#bcdbec',
          300: '#8cc2de',
          400: '#54a1c8',
          500: '#2f80aa',
          600: '#21688c',
          700: '#1f5573',
          800: '#1f495f',
          900: '#1e3d50',
          950: '#102634',
        },
        // Meena — refined emerald brand ramp
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
          950: '#022c22',
        },
        status: {
          completed: '#10b981',
          inProgress: '#0ea5e9',
          delayed: '#f43f5e',
          onHold: '#94a3b8',
          dependent: '#f97316',
        },
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        arabic: ['"Noto Sans Arabic"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Softer, layered elevation scale (premium, low-contrast)
        sm: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        DEFAULT: '0 1px 3px 0 rgb(16 24 40 / 0.08), 0 1px 2px -1px rgb(16 24 40 / 0.05)',
        md: '0 4px 10px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.04)',
        lg: '0 12px 20px -6px rgb(16 24 40 / 0.10), 0 4px 8px -4px rgb(16 24 40 / 0.05)',
        xl: '0 24px 32px -8px rgb(16 24 40 / 0.12), 0 8px 12px -6px rgb(16 24 40 / 0.05)',
        '2xl': '0 32px 64px -16px rgb(16 24 40 / 0.22)',
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)',
        lifted: '0 14px 40px -16px rgb(16 24 40 / 0.22)',
        glow: '0 0 0 1px rgb(33 104 140 / 0.15), 0 8px 24px -8px rgb(33 104 140 / 0.35)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.2s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;
