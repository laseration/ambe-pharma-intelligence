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
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
    },
  ],
};
