import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/*
 * Architecture rules live here as lint errors so they hold without a reviewer. Relax a rule in
 * this file with a comment explaining why; never with an inline eslint-disable.
 */
export default defineConfigWithVueTs(
  {
    ignores: [
      'dist/**',
      'dist-android/**',
      'dist-ios/**',
      'android/**',
      'ios/**',
      'dev-dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-globals': [
        'error',
        // All persistence goes through db/repository.ts (IndexedDB) so backups capture it.
        {
          name: 'localStorage',
          message: 'Use the repository (src/db) so data is included in backups.',
        },
        {
          name: 'sessionStorage',
          message: 'Use the repository (src/db) so data is included in backups.',
        },
        // The app is offline and private: no network calls at all.
        {
          name: 'fetch',
          message: 'PepCalc makes no network requests. Bundle data under src/data.',
        },
        { name: 'XMLHttpRequest', message: 'PepCalc makes no network requests.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'echarts',
              message: "Import from 'echarts/core' and register only the parts you use.",
            },
            {
              name: '@mdi/js',
              message: 'Re-export the icon from src/plugins/icons.ts and import it from there.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(toLocaleString|toLocaleDateString|toLocaleTimeString)$/]',
          message: 'Format dates only through src/services/time.ts.',
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message:
            'Read the clock and build dates only in src/services/time.ts (injectable Clock).',
        },
        {
          selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
          message: 'Read the clock only through src/services/time.ts (injectable Clock).',
        },
      ],
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The one module allowed to read the clock and format dates.
    files: ['src/services/time.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/plugins/icons.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Tests build fixed dates; scripts and configs run in Node.
    files: ['tests/**', 'e2e/**', 'scripts/**', 'build/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-globals': 'off' },
  },
  prettier,
)
