export interface PaginationParams {
    page?: number;
    limit?: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export declare function buildPagination(params: PaginationParams, total: number): PaginatedResponse<never>['pagination'];
export declare function serializeDate(date: Date | string | null): string | null;
export declare function serializeBoolean(value: boolean | number | null): boolean | null;
//# sourceMappingURL=base.d.ts.map