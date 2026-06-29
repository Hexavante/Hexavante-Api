export interface JWTPayload {
    sub: string;
    roles: string[];
    iat?: number;
    exp?: number;
}
export declare function signJWT(payload: JWTPayload): Promise<string>;
export declare function verifyJWT(token: string): Promise<JWTPayload>;
//# sourceMappingURL=jwt.d.ts.map