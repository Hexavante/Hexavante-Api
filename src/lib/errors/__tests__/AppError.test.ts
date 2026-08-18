import { describe, it, expect } from "vitest";
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from "../AppError";

describe("AppError", () => {
  describe("AppError (base class)", () => {
    it("should create an error with status code and message", () => {
      const error = new AppError(400, "Bad request");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Bad request");
      expect(error.name).toBe("AppError");
    });

    it("should accept optional code parameter", () => {
      const error = new AppError(400, "Bad request", "INVALID_INPUT");

      expect(error.code).toBe("INVALID_INPUT");
    });

    it("should have a stack trace", () => {
      const error = new AppError(400, "Bad request");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("AppError");
    });
  });

  describe("BadRequestError", () => {
    it("should create a 400 error with default message", () => {
      const error = new BadRequestError();

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Bad Request");
      expect(error.name).toBe("BadRequestError");
    });

    it("should create a 400 error with custom message", () => {
      const error = new BadRequestError("Invalid email format");

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Invalid email format");
    });

    it("should accept optional code parameter", () => {
      const error = new BadRequestError("Invalid input", "VALIDATION_ERROR");

      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new BadRequestError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("UnauthorizedError", () => {
    it("should create a 401 error with default message", () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Unauthorized");
      expect(error.name).toBe("UnauthorizedError");
    });

    it("should create a 401 error with custom message", () => {
      const error = new UnauthorizedError("Invalid token");

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Invalid token");
    });

    it("should accept optional code parameter", () => {
      const error = new UnauthorizedError("Token expired", "TOKEN_EXPIRED");

      expect(error.code).toBe("TOKEN_EXPIRED");
    });

    it("should be instance of AppError", () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("ForbiddenError", () => {
    it("should create a 403 error with default message", () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("Forbidden");
      expect(error.name).toBe("ForbiddenError");
    });

    it("should create a 403 error with custom message", () => {
      const error = new ForbiddenError("Insufficient permissions");

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe("Insufficient permissions");
    });

    it("should accept optional code parameter", () => {
      const error = new ForbiddenError("Admin only", "ADMIN_REQUIRED");

      expect(error.code).toBe("ADMIN_REQUIRED");
    });

    it("should be instance of AppError", () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("NotFoundError", () => {
    it("should create a 404 error with default message", () => {
      const error = new NotFoundError();

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Not Found");
      expect(error.name).toBe("NotFoundError");
    });

    it("should create a 404 error with custom message", () => {
      const error = new NotFoundError("User not found");

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("User not found");
    });

    it("should accept optional code parameter", () => {
      const error = new NotFoundError("Course not found", "COURSE_NOT_FOUND");

      expect(error.code).toBe("COURSE_NOT_FOUND");
    });

    it("should be instance of AppError", () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("ConflictError", () => {
    it("should create a 409 error with default message", () => {
      const error = new ConflictError();

      expect(error.statusCode).toBe(409);
      expect(error.message).toBe("Conflict");
      expect(error.name).toBe("ConflictError");
    });

    it("should create a 409 error with custom message", () => {
      const error = new ConflictError("Email already exists");

      expect(error.statusCode).toBe(409);
      expect(error.message).toBe("Email already exists");
    });

    it("should accept optional code parameter", () => {
      const error = new ConflictError("Duplicate entry", "DUPLICATE_ENTRY");

      expect(error.code).toBe("DUPLICATE_ENTRY");
    });

    it("should be instance of AppError", () => {
      const error = new ConflictError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("ValidationError", () => {
    it("should create a 422 error with default message", () => {
      const error = new ValidationError();

      expect(error.statusCode).toBe(422);
      expect(error.message).toBe("Validation Error");
      expect(error.name).toBe("ValidationError");
    });

    it("should create a 422 error with custom message", () => {
      const error = new ValidationError("Invalid input data");

      expect(error.statusCode).toBe(422);
      expect(error.message).toBe("Invalid input data");
    });

    it("should accept optional code parameter", () => {
      const error = new ValidationError(
        "Schema validation failed",
        "SCHEMA_ERROR"
      );

      expect(error.code).toBe("SCHEMA_ERROR");
    });

    it("should be instance of AppError", () => {
      const error = new ValidationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("InternalServerError", () => {
    it("should create a 500 error with default message", () => {
      const error = new InternalServerError();

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Internal Server Error");
      expect(error.name).toBe("InternalServerError");
    });

    it("should create a 500 error with custom message", () => {
      const error = new InternalServerError("Database connection failed");

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Database connection failed");
    });

    it("should accept optional code parameter", () => {
      const error = new InternalServerError(
        "Service unavailable",
        "SERVICE_DOWN"
      );

      expect(error.code).toBe("SERVICE_DOWN");
    });

    it("should be instance of AppError", () => {
      const error = new InternalServerError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("Error handling patterns", () => {
    it("should work with try-catch blocks", () => {
      const throwFn = () => {
        throw new NotFoundError("Resource not found");
      };

      expect(throwFn).toThrow(NotFoundError);
      expect(throwFn).toThrow("Resource not found");
    });

    it("should preserve error properties in catch", () => {
      try {
        throw new ValidationError("Invalid data", "VALIDATION_ERROR");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).statusCode).toBe(422);
        expect((error as ValidationError).code).toBe("VALIDATION_ERROR");
      }
    });

    it("should work with async functions", async () => {
      const asyncFn = async () => {
        throw new UnauthorizedError("Please log in");
      };

      await expect(asyncFn).rejects.toThrow(UnauthorizedError);
      await expect(asyncFn).rejects.toThrow("Please log in");
    });

    it("should work with Promise rejection", async () => {
      const rejectedPromise = Promise.reject(
        new ForbiddenError("Access denied")
      );

      await expect(rejectedPromise).rejects.toThrow(ForbiddenError);
    });
  });
});
