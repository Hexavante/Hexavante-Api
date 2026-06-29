export interface BearerAuthContext {
    userId: string;
    roles: string[];
}
export interface JwtPayload {
    sub: string;
    roles: string[];
    iat?: number;
    exp?: number;
}
//# sourceMappingURL=auth.types.d.ts.map