module.exports = {
  testEnvironment: 'jsdom',
  transformIgnorePatterns: ['node_modules/(?!scripture-guide)'],
  testMatch: ['**/test/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.worktrees/']
};
