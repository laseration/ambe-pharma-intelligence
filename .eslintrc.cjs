module.exports = {
  root: true,
  ignorePatterns: ['dist', '.next', 'node_modules', 'coverage'],
  overrides: [
    {
      files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier',
      ],
      rules: {
        '@typescript-eslint/no-namespace': [
          'error',
          { allowDeclarations: true },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: [
        'apps/api/src/**/*.test.ts',
        'apps/api/src/buyDecisions/service.ts',
        'apps/api/src/buyExecutions/service.ts',
        'apps/api/src/deals/service.ts',
        'apps/api/src/reviewQueue/workflowService.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
