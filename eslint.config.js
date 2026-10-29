import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const relativeJsImport = {
  regex: '^\\.{1,2}/.*\\.js$',
  message: 'Use .ts extensions for relative imports.',
};

const runtimeNeutral =
  'Library code runs on Node.js and Cloudflare Workers, use web standard APIs.';

const urlHelper =
  'Use parseUrl from src/core/url.ts, older Workers runtimes lack this static method.';

const nodeGlobals = [
  'process',
  'Buffer',
  'global',
  'require',
  '__dirname',
  '__filename',
  'setImmediate',
];

export default tseslint.config(
  { ignores: ['dist', 'docs/api', 'coverage', 'node_modules', '.reference', 'test/fixtures'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      'no-restricted-imports': ['error', { patterns: [relativeJsImport] }],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/cli/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({ name, message: runtimeNeutral })),
          patterns: [relativeJsImport, { regex: '^node:', message: runtimeNeutral }],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...nodeGlobals.map((name) => ({ name, message: runtimeNeutral })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'URL', property: 'parse', message: urlHelper },
        { object: 'URL', property: 'canParse', message: urlHelper },
      ],
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['**/*.test.ts', 'e2e/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['examples/**', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
