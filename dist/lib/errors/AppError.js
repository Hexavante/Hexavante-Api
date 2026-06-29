export class AppError extends Error {
    statusCode;
    message;
    code;
    constructor(statusCode, message, code) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.code = code;
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class BadRequestError extends AppError {
    constructor(message = 'Bad Request', code) {
        super(400, message, code);
        this.name = 'BadRequestError';
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized', code) {
        super(401, message, code);
        this.name = 'UnauthorizedError';
    }
}
export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden', code) {
        super(403, message, code);
        this.name = 'ForbiddenError';
    }
}
export class NotFoundError extends AppError {
    constructor(message = 'Not Found', code) {
        super(404, message, code);
        this.name = 'NotFoundError';
    }
}
export class ConflictError extends AppError {
    constructor(message = 'Conflict', code) {
        super(409, message, code);
        this.name = 'ConflictError';
    }
}
export class ValidationError extends AppError {
    constructor(message = 'Validation Error', code) {
        super(422, message, code);
        this.name = 'ValidationError';
    }
}
export class InternalServerError extends AppError {
    constructor(message = 'Internal Server Error', code) {
        super(500, message, code);
        this.name = 'InternalServerError';
    }
}
//# sourceMappingURL=AppError.js.map