/**
 * Test setup file
 * Runs before each test suite
 */
import { vi, beforeAll, afterAll } from "vitest";

// Mock environment variables for tests
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://root:test_password@localhost:3306/hexavante_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.AUTH_SECRET = "test-secret-key-for-testing-only-32chars!!";
process.env.BETTER_AUTH_URL = "http://localhost:3045";
process.env.AUTH_URL = "http://localhost:3045";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.GITHUB_CLIENT_ID = "test-github-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret";
process.env.ADMIN_USER_IDS = "admin-user-id-1,admin-user-id-2";

// Mock console.error in tests to reduce noise
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Warning: ReactDOM.render is no longer supported")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
