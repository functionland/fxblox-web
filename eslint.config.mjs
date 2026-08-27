// Flat ESLint config for the whole workspace.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.cache/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-side scripts and tools (fake Blox, postbuild, vite config).
    files: ['**/*.mjs', '**/*.cjs', 'eslint.config.*', '**/scripts/**', 'tools/**', '**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Browser + test globals for app/package sources.
    files: ['apps/**/src/**', 'packages/**/src/**', 'packages/**/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The port must never pull React Native / mobile-only modules back in.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react-native', 'react-native-*', '@react-native-*/*'], message: 'Web app: no React Native imports.' },
            { group: ['axios'], message: 'Use platform/lanHttp or fetch.' },
            { group: ['@react-native-async-storage/*'], message: 'Use platform/kvStore.' },
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
