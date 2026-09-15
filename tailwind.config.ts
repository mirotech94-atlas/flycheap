import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0a3a6b',
          50:  '#eef4fb',
          100: '#d6e4f3',
          200: '#aac5e6',
          300: '#7aa3d4',
          400: '#4a82c1',
          500: '#1f5fa5',
          600: '#134885',
          700: '#0a3a6b',
          800: '#082c50',
          900: '#051d36',
          accent: '#d4af37',
          gold:   '#d4af37',
          ink:    '#0b1220',
        },
        canvas: {
          DEFAULT: '#f6f8fb',
          dark:    '#0b1220',
        },
      },
      fontFamily: {
        sans:    ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular'],
      },
      boxShadow: {
        soft:  '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)',
        card:  '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10)',
        lift:  '0 10px 30px -12px rgba(10,58,107,.25), 0 4px 10px -4px rgba(15,23,42,.08)',
        ring:  '0 0 0 1px rgba(10,58,107,.08)',
      },
      backgroundImage: {
        'brand-gradient':   'linear-gradient(135deg, #0a3a6b 0%, #134885 55%, #1f5fa5 100%)',
        'gold-gradient':    'linear-gradient(135deg, #d4af37 0%, #b8902a 100%)',
        'panel-light':      'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(246,248,251,1) 100%)',
        'panel-dark':       'linear-gradient(180deg, rgba(17,24,39,1) 0%, rgba(11,18,32,1) 100%)',
        'grid-light':       "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><path d='M40 0H0v40' fill='none' stroke='%23e2e8f0' stroke-width='.5'/></svg>\")",
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
};

export default config;
