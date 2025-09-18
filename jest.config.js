export default {
  // 测试环境
  testEnvironment: 'node',

  // ES Module 支持
  preset: null,
  transform: {},

  // 模块解析
  moduleFileExtensions: ['js'],

  // 测试文件匹配
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js',
  ],

  // 忽略的目录
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
  ],

  // 覆盖率配置
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/**/index.js',
  ],

  // 覆盖率阈值（PRP要求80%+）
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // 覆盖率报告
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
  ],

  // 设置文件
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // 全局变量
  globals: {
    'process.env.NODE_ENV': 'test',
  },

  // 测试超时
  testTimeout: 30000,

  // 详细输出
  verbose: true,

  // 错误时停止
  bail: false,

  // 清除模拟
  clearMocks: true,

  // 强制退出
  forceExit: true,

  // 检测打开的句柄
  detectOpenHandles: true,
};