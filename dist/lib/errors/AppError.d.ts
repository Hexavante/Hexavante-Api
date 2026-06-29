export declare class AppError extends Error {
    statusCode: number;
    message: string;
    code?: string | undefined;
    constructor(statusCode: number, message: string, code?: string | undefined);
}
export declare class BadRequestError extends AppError {
    constructor(message?: string, code?: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string, code?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string, code?: string);
}
export declare class NotFoundError extends AppError {
    constructor(message?: string, code?: string);
}
export declare class ConflictError extends AppError {
    constructor(message?: string, code?: string);
}
export declare class ValidationError extends AppError {
    constructor(message?: string, code?: string);
}
export declare class InternalServerError extends AppError {
    constructor(message?: string, code?: string);
}
//# sourceMappingURL=AppError.d.ts.map