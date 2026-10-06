/**
 * Test setup file
 * Runs before each test suite
 */
import { vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Uploads de teste: diretório efêmero (nunca polui o repo nem o /tmp fixo).
process.env.UPLOAD_DIR ??= mkdtempSync(path.join(tmpdir(), "hexavante-test-uploads-"));

// Mock environment variables for tests.
// Valores lidos do ambiente quando definidos (ex.: CI via TEST_*);
// os fallbacks são placeholders de TESTE (banco descartável local) e
// nunca devem ser usados em produção.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "mysql://root:test_password@localhost:3306/hexavante_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";
process.env.AUTH_SECRET =
  process.env.TEST_AUTH_SECRET ?? "test-secret-key-for-testing-only-32chars!!";
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
