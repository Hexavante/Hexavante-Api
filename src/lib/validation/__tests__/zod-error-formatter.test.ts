import { describe, it, expect } from "vitest";
import { ZodError, z } from "zod";
import {
  formatZodError,
  createZodErrorResponse,
  ValidationError,
} from "../zod-error-formatter";

describe("zod-error-formatter", () => {
  describe("formatZodError", () => {
    it("should format a single field error", () => {
      const schema = z.object({
        email: z.string().email(),
      });

      let error: ZodError;
      try {
        schema.parse({ email: "invalid-email" });
      } catch (e) {
        error = e as ZodError;
      }

      const result = formatZodError(error!);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        field: "email",
        message: expect.any(String),
      });
    });

    it("should format multiple field errors", () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        age: z.number().min(18),
      });

      let error: ZodError;
      try {
        schema.parse({ name: "", email: "invalid", age: 10 });
      } catch (e) {
        error = e as ZodError;
      }

      const result = formatZodError(error!);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.field)).toEqual(
        expect.arrayContaining(["name", "email", "age"])
      );
    });

    it("should format nested field errors with dot notation", () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string().min(1),
          }),
        }),
      });

      let error: ZodError;
      try {
        schema.parse({ user: { profile: { name: "" } } });
      } catch (e) {
        error = e as ZodError;
      }

      const result = formatZodError(error!);

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe("user.profile.name");
    });

    it("should format array field errors", () => {
      const schema = z.object({
        tags: z.array(z.string().min(1)),
      });

      let error: ZodError;
      try {
        schema.parse({ tags: ["valid", "", "also valid"] });
      } catch (e) {
        error = e as ZodError;
      }

      const result = formatZodError(error!);

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe("tags.1");
    });

    it("should handle empty error issues", () => {
      const error = new ZodError([]);

      const result = formatZodError(error);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });
  });

  describe("createZodErrorResponse", () => {
    it("should create a standard error response", () => {
      const schema = z.object({
        email: z.string().email(),
      });

      let error: ZodError;
      try {
        schema.parse({ email: "invalid-email" });
      } catch (e) {
        error = e as ZodError;
      }

      const response = createZodErrorResponse(error!);

      expect(response).toEqual({
        success: false,
        message: "Validation failed",
        errors: expect.arrayContaining([
          {
            field: "email",
            message: expect.any(String),
          },
        ]),
      });
    });

    it("should include multiple errors", () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      });

      let error: ZodError;
      try {
        schema.parse({ name: "", email: "invalid" });
      } catch (e) {
        error = e as ZodError;
      }

      const response = createZodErrorResponse(error!);

      expect(response.success).toBe(false);
      expect(response.errors).toHaveLength(2);
    });

    it("should always have success: false", () => {
      const error = new ZodError([]);

      const response = createZodErrorResponse(error);

      expect(response.success).toBe(false);
    });

    it("should always have message: 'Validation failed'", () => {
      const error = new ZodError([]);

      const response = createZodErrorResponse(error);

      expect(response.message).toBe("Validation failed");
    });
  });

  describe("real-world schemas", () => {
    it("should format email validation error", () => {
      const schema = z.object({
        email: z.string().email("Invalid email format"),
      });

      let error: ZodError;
      try {
        schema.parse({ email: "not-an-email" });
      } catch (e) {
        error = e as ZodError;
      }

      const response = createZodErrorResponse(error!);

      expect(response.errors[0].field).toBe("email");
      expect(response.errors[0].message).toContain("email");
    });

    it("should format password validation error", () => {
      const schema = z.object({
        password: z.string().min(8, "Password must be at least 8 characters"),
      });

      let error: ZodError;
      try {
        schema.parse({ password: "123" });
      } catch (e) {
        error = e as ZodError;
      }

      const response = createZodErrorResponse(error!);

      expect(response.errors[0].field).toBe("password");
      expect(response.errors[0].message).toContain("8");
    });

    it("should format enum validation error", () => {
      const schema = z.object({
        role: z.enum(["user", "admin", "moderator"]),
      });

      let error: ZodError;
      try {
        schema.parse({ role: "superadmin" });
      } catch (e) {
        error = e as ZodError;
      }

      const response = createZodErrorResponse(error!);

      expect(response.errors[0].field).toBe("role");
    });
  });
});
