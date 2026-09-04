import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'android/**', 'node_modules/**', 'scripts/**', '*.config.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaVersion: 2023, sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // 高价值规则：undefined 标识符（运行时炸）、Hook 规则（条件分支调 Hook 等）
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // 低价值/历史代码太吵：降为关闭或警告
      'react-hooks/exhaustive-deps': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // 冒烟/单元测试文件：跑在 Node 里（process 等全局合法），且不参与浏览器构建
    files: ['src/**/*.test.js', 'src/**/*.test.jsx', 'src/**/*.spec.js'],
    languageOptions: { globals: { process: 'readonly' } },
    rules: { 'no-useless-assignment': 'off' },
  },
]
