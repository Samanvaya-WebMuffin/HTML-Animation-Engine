import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PURE_TIME_MESSAGE =
  'Animations are a pure function of time: derive everything from `t`. ' +
  'For randomness use the seeded RNG from @html-animation-engine/core.';

/** Code that runs inside (or builds) a `render(t)` path. */
const RENDER_PATHS = [
  'packages/core/src/**/*.ts',
  'packages/renderers/src/**/*.ts',
  'packages/adapters/src/**/*.ts',
  'examples/**/*.ts',
];

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'out/**',
      'renders/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: RENDER_PATHS,
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: PURE_TIME_MESSAGE },
        { object: 'Date', property: 'now', message: PURE_TIME_MESSAGE },
        { object: 'performance', property: 'now', message: PURE_TIME_MESSAGE },
        { object: 'window', property: 'requestAnimationFrame', message: PURE_TIME_MESSAGE },
        { object: 'globalThis', property: 'requestAnimationFrame', message: PURE_TIME_MESSAGE },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'requestAnimationFrame', message: PURE_TIME_MESSAGE },
        { name: 'setTimeout', message: PURE_TIME_MESSAGE },
        { name: 'setInterval', message: PURE_TIME_MESSAGE },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: PURE_TIME_MESSAGE,
        },
      ],
    },
  },
  {
    // Non-null assertions are fine in tests: a wrong assumption fails the test.
    files: ['**/test/**/*.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  prettier,
);
