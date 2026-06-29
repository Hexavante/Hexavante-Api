export declare const auth: import("better-auth").Auth<{
    database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("better-auth").BetterAuthOptions>;
    emailAndPassword: {
        enabled: true;
        requireEmailVerification: false;
    };
    session: {
        expiresIn: number;
        updateAge: number;
        cookieCache: {
            enabled: true;
            maxAge: number;
        };
    };
    advanced: {
        cookiePrefix: string;
        crossSubDomainCookies: {
            enabled: false;
        };
    };
    secret: string;
}>;
//# sourceMappingURL=auth.d.ts.map