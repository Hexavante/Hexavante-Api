import { JWTPayload } from '../../../lib/jwt';
import { RegisterInput } from '../schemas/auth.schemas';
export declare class AuthService {
    validateCredentials(email: string, password: string): Promise<{
        id: string;
        name: string;
        email: string;
        username: string;
        roles: string[];
    } | null>;
    registerUser(data: RegisterInput): Promise<{
        email: string;
        username: string;
        fullName: string;
        id: string;
    }>;
    createToken(userId: string, roles: string[]): Promise<string>;
    verifyToken(token: string): Promise<JWTPayload>;
    getUserById(userId: string): Promise<({
        roles: ({
            role: {
                id: string;
                name: string;
                description: string | null;
            };
        } & {
            id: string;
            userId: string;
            roleId: string;
            assignedAt: Date;
            assignedBy: string | null;
        })[];
    } & {
        email: string;
        username: string;
        fullName: string;
        birthDate: Date;
        id: string;
        passwordHash: string | null;
        provider: string;
        providerId: string | null;
        avatarUrl: string | null;
        phone: string | null;
        city: string | null;
        state: string | null;
        bio: string | null;
        profileVisibility: string;
        isVerified: boolean;
        isPremium: boolean;
        premiumExpiresAt: Date | null;
        coins: number;
        boosterMultiplier: number;
        boosterExpiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        lastLogin: Date | null;
        onboardingCompletedAt: Date | null;
        lastStudyCourseSlug: string | null;
        lastStudyLessonId: string | null;
        lastStudyAt: Date | null;
    }) | null>;
}
//# sourceMappingURL=auth.service.d.ts.map