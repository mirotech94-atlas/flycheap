import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* The house blue, re-hued from the retired Bloomberg navy (hue ~210, the
           old #0a3a6b ramp) onto night-cabin's own blue (hue ~197), so it sits
           beside --nc-teal #6FB3C9 instead of reading as a third, foreign blue.
           The LUMINANCE ladder is deliberately unchanged, step for step, so
           every existing `text-brand-700 dark:text-brand-300` pairing keeps the
           contrast it was built for. 300 is tuned to sit beside --nc-teal; 500
           matches the deck ramp's light end used by the cabin overrides.

           Note the text ends of this ramp are dead on cabin: the coal override
           for .text-brand-700/600 out-specifies the dark: utilities. What IS
           live here is borders, rings, washes and the from-/to- gradients --
           which is exactly where the old navy was still leaking through. */
        brand: {
          DEFAULT: '#1A4459',
          50:  '#eef5f9',
          100: '#d5e7ef',
          200: '#a9cddd',
          300: '#7fb6cb',
          400: '#4e90ac',
          500: '#2f6f91',
          600: '#235870',
          700: '#1a4459',
          800: '#143546',
          900: '#0d2331',
          /* No `gold`/`accent` here any more. They both held the retired
             Bloomberg #d4af37 and were spent on DECORATION, which is the one
             thing --nc-amber is not allowed to be. Call sites now take a role
             token directly: --nc-amber for fares and the primary action,
             --nc-teal for wayfinding, selection and atmosphere. */
          ink:    '#0b1220',
        },
        canvas: {
          DEFAULT: '#f6f8fb',
          dark:    '#0b1220',
        },
      },
      fontFamily: {
        /* Editorial redesign faces only — Public Sans, Newsreader, IBM Plex
           Mono (docs/design/handoff/README.md "Type"), bound via the
           --font-ui/--font-serif/--font-mono-ed tokens in editorial.css. */
        sans:    ['var(--font-ui)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-serif)', 'var(--font-ui)', 'ui-sans-serif', 'system-ui'],
        mono:    ['var(--font-mono-ed)', 'ui-monospace', 'SFMono-Regular'],
      },
      boxShadow: {
        /* soft/card/lift deleted (task 3.10): their only call sites were
           ExploreSearchBar.tsx and Select.tsx, both removed as orphaned
           components. ring is unrelated (no `shadow-ring` consumer found)
           but is left alone — out of scope for the fonts/shadow cleanup. */
        ring:  '0 0 0 1px rgba(26,68,89,.10)',
      },
      backgroundImage: {
        /* Re-hued with the ramp above. The cabin override in globals.css wins
           over this on every themed surface, but it is what any unthemed
           surface falls back to, so it must not be the retired navy either. */
        'brand-gradient':   'linear-gradient(135deg, #1a4459 0%, #235870 55%, #2f6f91 100%)',
        /* `gold-gradient` is gone: it held the retired Bloomberg gold and had
           ZERO call sites, so it was a loaded gun for the next person reaching
           for "the gold one". Fares and primary actions take --nc-amber. */
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
