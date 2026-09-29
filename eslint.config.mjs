// Flat config. `next lint` was removed in Next 16, so `npm run lint` runs ESLint
// directly with Next's own shareable configs.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      'node_modules/**', '.next/**', '.next.a/**', '.next.b/**',
      'ios-app/**', 'mobile/**', 'public/**', 'design/**', 'New design/**',
      'src.before-resync-bak/**', 'src.before-rename-2026-09-09/**',
      'next-env.d.ts',
    ],
  },
  {
    // First lint config this repo has had since Next 16 dropped `next lint`.
    // These rules flag existing code (React Compiler advisories and loose
    // `any`s) that works today; they stay visible as warnings rather than
    // block every change until they are paid down.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Plain Node scripts are CommonJS.
    files: ['scripts/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // `useTempDb` is a test helper, not a React hook.
    files: ['tests/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
];

export default config;
