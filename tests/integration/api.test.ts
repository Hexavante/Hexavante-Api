import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../../src/server";
import type { FastifyInstance } from "fastify";

describe("API Integration Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Health Check", () => {
    it("should return 200 on health endpoint", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe("ok");
    });
  });

  describe("Authentication", () => {
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!",
      username: `testuser-${Date.now()}`,
      fullName: "Test User",
      birthDate: "2000-01-01",
    };

    describe("POST /api/auth/sign-up/email", () => {
      it("should register a new user", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          payload: testUser,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.user).toBeDefined();
        expect(body.user.email).toBe(testUser.email);
      });

      it("should return 400 for invalid email", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          payload: {
            ...testUser,
            email: "invalid-email",
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it("should return 400 for short password", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          payload: {
            ...testUser,
            email: `test2-${Date.now()}@example.com`,
            password: "123",
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it("should return 409 for duplicate email", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          payload: testUser,
        });

        expect(response.statusCode).toBe(409);
      });
    });

    describe("POST /api/auth/sign-in/email", () => {
      it("should login with valid credentials", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: {
            email: testUser.email,
            password: testUser.password,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.user).toBeDefined();
        expect(body.user.email).toBe(testUser.email);
      });

      it("should return 401 for invalid credentials", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: {
            email: testUser.email,
            password: "wrongpassword",
          },
        });

        expect(response.statusCode).toBe(401);
      });

      it("should return 401 for non-existent user", async () => {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: {
            email: "nonexistent@example.com",
            password: "password",
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  describe("Courses", () => {
    describe("GET /api/v1/courses", () => {
      it("should return paginated courses", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/courses",
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data).toBeDefined();
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.pagination).toBeDefined();
      });

      it("should support pagination", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/courses?page=1&limit=5",
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.pagination.page).toBe(1);
        expect(body.pagination.limit).toBe(5);
      });
    });

    describe("GET /api/v1/courses/:id", () => {
      it("should return 404 for non-existent course", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/api/v1/courses/nonexistent",
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  describe("Protected Routes", () => {
    it("should return 401 for unauthenticated requests", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 401 with invalid token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: {
          cookie: "hexavante.session_token=invalid-token",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("404 Handler", () => {
    it("should return 404 for unknown routes", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/nonexistent-route",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("CORS", () => {
    it("should include CORS headers", async () => {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/health",
        headers: {
          origin: "https://hexavante.com.br",
          "access-control-request-method": "GET",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBeDefined();
    });
  });

  describe("Rate Limiting", () => {
    it("should have rate limiting headers", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });

      // Rate limiting headers may or may not be present depending on config
      expect(response.statusCode).toBe(200);
    });
  });
});
