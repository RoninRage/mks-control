import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import globals from 'globals';

// Flat config for ESLint 9 (migrated from the former .eslintrc.cjs)
export default defineConfigWithVueTs(
  {
    ignores: ['dist/**', '.quasar/**', 'node_modules/**', 'src-capacitor/**', 'src-cordova/**'],
  },

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    rules: {
      'prefer-promise-reject-errors': 'off',

      quotes: ['warn', 'single', { avoidEscape: true }],

      // this rule, if on, would require explicit return type on the `render` function
      '@typescript-eslint/explicit-function-return-type': 'off',

      // The core 'no-unused-vars' rule does not work with type definitions
      'no-unused-vars': 'off',

      // allow debugger during development only
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',

      'vue/multi-word-component-names': 'off',

      // Layout of templates is Prettier's job; these rules would fight it.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-self-closing': ['warn', { html: { void: 'any' } }],
    },
  }
);
