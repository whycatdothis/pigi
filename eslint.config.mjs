import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';

// Tailwind class strings such as `md:flex` or `data-[side=left]:sm:max-w-sm`.
const BREAKPOINT_VARIANT_PATTERN = '(^|[\\s:])(max-)?(sm|md|lg|xl|2xl):[a-z\\[-]';

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'scripts/**/*.cjs'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
    },
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    rules: {
      curly: ['error', 'all'],
    },
  },
  {
    files: [
      'src/renderer/src/components/ui/**/*.{ts,tsx}',
      'src/renderer/src/components/themeProvider.tsx',
    ],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useAppStore'][arguments.length=0]",
          message:
            'Select the app store fields this component needs; use useShallow for multiple fields to avoid layout-wide renders.',
        },
        {
          selector: `:matches(Literal[value=/${BREAKPOINT_VARIANT_PATTERN}/], TemplateElement[value.raw=/${BREAKPOINT_VARIANT_PATTERN}/])`,
          message:
            'No responsive breakpoint variants: a viewport-width media query forces a full style and layout pass on every crossing during window resize. Write the desktop style unconditionally.',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '.pi/skills/**/scripts/**/*.{js,mjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  eslintConfigPrettier,
);
