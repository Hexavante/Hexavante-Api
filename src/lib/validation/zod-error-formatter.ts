import { ZodError } from 'zod';

export interface ValidationError {
  field: string;
  message: string;
}

export function formatZodError(error: ZodError): ValidationError[] {
  return error.issues.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

export function createZodErrorResponse(error: ZodError) {
  return {
    success: false,
    message: 'Validation failed',
    errors: formatZodError(error),
  };
}
