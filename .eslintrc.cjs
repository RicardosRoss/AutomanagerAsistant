const restrictedTimers = [
  'error',
  {
    name: 'setTimeout',
    message: '禁止使用 setTimeout，请使用 Bull Queue 进行定时任务'
  },
  {
    name: 'setInterval',
    message: '禁止使用 setInterval，请使用 Bull Queue 进行定时任务'
  }
];

const commonRules = {
  'array-bracket-spacing': ['error', 'never'],
  'comma-dangle': ['error', 'never'],
  'max-len': ['error', { code: 120, ignoreUrls: true }],
  'no-console': ['warn'],
  'no-debugger': ['warn'],
  'no-await-in-loop': 'warn',
  'object-curly-spacing': ['error', 'always'],
  'prefer-promise-reject-errors': 'error',
  'no-restricted-globals': restrictedTimers
};

module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  ignorePatterns: ['dist/', 'coverage/'],
  overrides: [
    {
      files: ['**/*.js'],
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      rules: {
        ...commonRules,
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
      }
    },
    {
      files: ['**/*.ts'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      plugins: ['@typescript-eslint'],
      rules: {
        ...commonRules,
        'no-unused-vars': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
      }
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        'no-var': 'off'
      }
    },
    {
      files: ['tests/**/*.{js,ts}', '**/*.test.{js,ts}', '**/*.spec.{js,ts}'],
      rules: {
        'no-console': 'off'
      }
    },
    {
      files: ['src/utils/helpers.ts', 'src/config/redis.ts'],
      rules: {
        'no-restricted-globals': [
          'error',
          {
            name: 'setInterval',
            message: '禁止使用 setInterval，请使用 Bull Queue 进行定时任务'
          }
        ]
      }
    }
  ]
};
