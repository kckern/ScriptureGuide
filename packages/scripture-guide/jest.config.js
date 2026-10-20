export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.test.mjs'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.mjs',
    '!src/**/*.test.mjs'
  ],
  setupFilesAfterEnv: ['./test/setup.js'],
  // <rootDir>-anchored so running jest FROM a worktree still finds its own tests
  // (a bare '/.worktrees/' pattern matches the worktree's own absolute path)
  testPathIgnorePatterns: ['/node_modules/', '/_archive/', '/test/_archive/', '<rootDir>/.worktrees/'],
  verbose: true,
  reporters: [
    'default',
    ['./test/helpers/markdown-reporter.js', { outputFile: 'test-results.md' }]
  ]
};
