export interface LoginDto {
    email: string;
    password: string;
}
export interface RegisterDto {
    username: string;
    fullName: string;
    email: string;
    password: string;
    birthDate: Date;
}
export interface RefreshTokenDto {
    refreshToken: string;
}
export interface AuthResponse {
    token: string;
    user: {
        id: string;
        name: string;
        email: string;
        username: string;
        roles: string[];
    };
}
//# sourceMappingURL=auth.dto.d.ts.map