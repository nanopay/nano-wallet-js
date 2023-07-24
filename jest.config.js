/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	roots: ['<rootDir>/src'],
	preset: 'ts-jest',
	testEnvironment: './jest-environment-fail-fast.ts',
	testPathIgnorePatterns: ['node_modules'],
	verbose: true,
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
	},
	collectCoverage: false,
	coverageDirectory: 'coverage',
	coverageThreshold: {
		global: {
			branches: 100,
			functions: 100,
			lines: 100,
			statements: 100,
		},
	},
	testRunner: 'jest-circus/runner',
};
