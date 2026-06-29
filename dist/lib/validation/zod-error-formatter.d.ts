import { ZodError } from 'zod';
export interface ValidationError {
    field: string;
    message: string;
}
export declare function formatZodError(error: ZodError): ValidationError[];
export declare function createZodErrorResponse(error: ZodError): {
    success: boolean;
    message: string;
    errors: ValidationError[];
};
//# sourceMappingURL=zod-error-formatter.d.ts.map