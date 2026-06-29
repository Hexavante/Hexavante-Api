export function validateBody(schema) {
    return async (request, reply) => {
        const result = schema.safeParse(request.body);
        if (!result.success) {
            throw result.error;
        }
        request.body = result.data;
    };
}
export function validateQuery(schema) {
    return async (request, reply) => {
        const result = schema.safeParse(request.query);
        if (!result.success) {
            throw result.error;
        }
        request.query = result.data;
    };
}
export function validateParams(schema) {
    return async (request, reply) => {
        const result = schema.safeParse(request.params);
        if (!result.success) {
            throw result.error;
        }
        request.params = result.data;
    };
}
//# sourceMappingURL=validate.js.map