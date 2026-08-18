import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateBody, validateQuery, validateParams } from "../validate";
import { z } from "zod";

describe("validate middleware", () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
      query: {},
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe("validateBody", () => {
    it("should validate and parse valid body", async () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      mockRequest.body = {
        name: "Test User",
        email: "test@example.com",
      };

      const middleware = validateBody(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.body).toEqual({
        name: "Test User",
        email: "test@example.com",
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should throw ZodError for invalid body", async () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      mockRequest.body = {
        name: "Test User",
        email: "invalid-email",
      };

      const middleware = validateBody(schema);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();
    });

    it("should throw ZodError for missing required fields", async () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      mockRequest.body = {
        name: "Test User",
      };

      const middleware = validateBody(schema);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();
    });

    it("should strip unknown fields", async () => {
      const schema = z.object({
        name: z.string(),
      });

      mockRequest.body = {
        name: "Test User",
        unknownField: "should be stripped",
      };

      const middleware = validateBody(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.body).toEqual({
        name: "Test User",
      });
    });

    it("should handle empty body with optional fields", async () => {
      const schema = z.object({
        name: z.string(),
        bio: z.string().optional(),
      });

      mockRequest.body = {
        name: "Test User",
      };

      const middleware = validateBody(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.body).toEqual({
        name: "Test User",
      });
    });
  });

  describe("validateQuery", () => {
    it("should validate and parse valid query", async () => {
      const schema = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(10),
      });

      mockRequest.query = {
        page: "1",
        limit: "10",
      };

      const middleware = validateQuery(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.query).toEqual({
        page: 1,
        limit: 10,
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should throw ZodError for invalid query", async () => {
      const schema = z.object({
        page: z.number().min(1),
      });

      mockRequest.query = {
        page: -1,
      };

      const middleware = validateQuery(schema);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();
    });

    it("should apply default values", async () => {
      const schema = z.object({
        page: z.number().default(1),
        limit: z.number().default(10),
      });

      mockRequest.query = {};

      const middleware = validateQuery(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.query).toEqual({
        page: 1,
        limit: 10,
      });
    });

    it("should handle empty query", async () => {
      const schema = z.object({
        search: z.string().optional(),
      });

      mockRequest.query = {};

      const middleware = validateQuery(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.query).toEqual({});
    });
  });

  describe("validateParams", () => {
    it("should validate and parse valid params", async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      mockRequest.params = {
        id: "123e4567-e89b-12d3-a456-426614174000",
      };

      const middleware = validateParams(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.params).toEqual({
        id: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it("should throw ZodError for invalid params", async () => {
      const schema = z.object({
        id: z.string().uuid(),
      });

      mockRequest.params = {
        id: "not-a-uuid",
      };

      const middleware = validateParams(schema);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();
    });

    it("should throw ZodError for missing params", async () => {
      const schema = z.object({
        id: z.string(),
        action: z.string(),
      });

      mockRequest.params = {
        id: "123",
      };

      const middleware = validateParams(schema);

      await expect(middleware(mockRequest, mockReply)).rejects.toThrow();
    });

    it("should handle number params", async () => {
      const schema = z.object({
        id: z.coerce.number(),
      });

      mockRequest.params = {
        id: "123",
      };

      const middleware = validateParams(schema);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.params).toEqual({
        id: 123,
      });
    });
  });
});
