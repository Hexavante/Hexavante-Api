export function formatZodError(error) {
    return error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
    }));
}
export function createZodErrorResponse(error) {
    return {
        success: false,
        message: 'Validation failed',
        errors: formatZodError(error),
    };
}
//# sourceMappingURL=zod-error-formatter.js.map