import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // 类型安全：显式 any 一律警告，逼团队用具体类型或精确断言
      '@typescript-eslint/no-explicit-any': 'warn',
      // 未使用变量/参数直接报错（参数可用 _ 前缀豁免）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 生产代码禁止 console.*
      'no-console': 'warn',
      // 基础可读性
      'prefer-const': 'error',
      'no-fallthrough': 'error',
      'no-duplicate-case': 'error',
    },
  },
  {
    ignores: ['main.js', 'node_modules/**', '**/*.js', '**/*.mjs'],
  },
];
