export function buildPagination(params, total) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const totalPages = Math.ceil(total / limit);
    return {
        page,
        limit,
        total,
        totalPages,
    };
}
export function serializeDate(date) {
    if (!date)
        return null;
    if (typeof date === 'string')
        return date;
    return date.toISOString();
}
export function serializeBoolean(value) {
    if (value === null)
        return null;
    return Boolean(value);
}
//# sourceMappingURL=base.js.map