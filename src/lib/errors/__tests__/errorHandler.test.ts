import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleError, asyncHandler } from "../errorHandler";
import { AppError, BadRequestError, NotFoundError } from "../AppError";
import { ZodError } from "zod";

// Mock dependencies
vi.mock("../../../config/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../validation/zod-error-formatter", () => ({
  createZodErrorResponse: vi.fn().mockReturnValue({
    success: false,
    error: "Validation failed",
    issues: [],
  }),
}));

describe("errorHandler", () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      url: "/api/test",
      method: "GET",
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe("handleError", () => {
    it("should handle ZodError with 400 status", async () => {
      const { createZodErrorResponse } = await import(
        "../../validation/zod-error-formatter"
      );
      const zodError = new ZodError([
        {
          code: "invalid_type",
          expected: "string",
          received: "number",
          path: ["email"],
          message: "Expected string, received number",
        },
      ]);

      handleError(zodError, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalled();
      expect(createZodErrorResponse).toHaveBeenCalledWith(zodError);
    });

    it("should handle AppError with its status code", () => {
      const appError = new NotFoundError("User not found");

      handleError(appError, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
        code: undefined,
      });
    });

    it("should handle AppError with code", () => {
      const appError = new BadRequestError("Invalid input", "VALIDATION_ERROR");

      handleError(appError, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Invalid input",
        code: "VALIDATION_ERROR",
      });
    });

    it("should handle generic Error with 500 status", () => {
      const genericError = new Error("Something went wrong");

      handleError(genericError, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });

    it("should handle unknown error type with 500 status", () => {
      const unknownError = "string error";

      handleError(unknownError, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });

    it("should handle null error with 500 status", () => {
      handleError(null, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });

    it("should handle undefined error with 500 status", () => {
      handleError(undefined, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });
  });

  describe("asyncHandler", () => {
    it("should execute the handler function", async () => {
      const handler = asyncHandler(async (req, reply) => {
        reply.status(200).send({ success: true });
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });

    it("should catch and handle errors from async handler", async () => {
      const handler = asyncHandler(async (req, reply) => {
        throw new NotFoundError("Resource not found");
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Resource not found",
        code: undefined,
      });
    });

    it("should catch and handle generic errors from async handler", async () => {
      const handler = asyncHandler(async (req, reply) => {
        throw new Error("Unexpected error");
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });

    it("should handle ZodError in async handler", async () => {
      const handler = asyncHandler(async (req, reply) => {
        throw new ZodError([
          {
            code: "invalid_type",
            expected: "string",
            received: "number",
            path: ["email"],
            message: "Expected string, received number",
          },
        ]);
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it("should handle successful promise rejection", async () => {
      const handler = asyncHandler(async (req, reply) => {
        await Promise.resolve();
        reply.status(200).send({ success: true });
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe("error logging", () => {
    it("should log AppError as warning", async () => {
      const { logger } = await import("../../../config/logger");
      const appError = new BadRequestError("Invalid request");

      handleError(appError, mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        {
          error: "Invalid request",
          code: undefined,
          statusCode: 400,
          path: "/api/test",
          method: "GET",
        },
        "Application error"
      );
    });

    it("should log generic Error as error", async () => {
      const { logger } = await import("../../../config/logger");
      const genericError = new Error("Something failed");

      handleError(genericError, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Something failed",
          path: "/api/test",
          method: "GET",
        }),
        "Unexpected error"
      );
    });

    it("should log ZodError as warning", async () => {
      const { logger } = await import("../../../config/logger");
      const zodError = new ZodError([]);

      handleError(zodError, mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: [],
          path: "/api/test",
          method: "GET",
        }),
        "Validation error"
      );
    });
  });
});
