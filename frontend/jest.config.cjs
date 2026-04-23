/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": ["babel-jest", { configFile: "./babel.config.cjs" }],
  },
  moduleNameMapper: {
    "\\.(css|less|scss)$": "<rootDir>/src/__mocks__/fileMock.cjs",
  },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
};
