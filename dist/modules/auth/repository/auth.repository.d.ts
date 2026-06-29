export declare class AuthRepository {
    findUserByEmail(email: string): Promise<({
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
    findUserById(id: string): Promise<({
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
    createUser(data: any): Promise<{
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
    }>;
    updateUserLastLogin(userId: string): Promise<{
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
    }>;
}
//# sourceMappingURL=auth.repository.d.ts.map