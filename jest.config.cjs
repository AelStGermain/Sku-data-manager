module.exports = {
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/config/defaults.js",
    "!src/docs/openapi.js",
    "!src/server.js",
  ],
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 90,
      lines: 85,
      statements: 85,
    },
  },
  testEnvironment: "node",
  testMatch: [
    "**/tests/unit/**/*.test.js",
    "**/tests/integration/**/*.test.js",
    "**/tests/regression/**/*.test.js",
  ],
  verbose: true,
};
