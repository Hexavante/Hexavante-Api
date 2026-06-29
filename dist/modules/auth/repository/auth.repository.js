import { prisma } from '../../../config/prisma';
export class AuthRepository {
    async findUserByEmail(email) {
        return prisma.user.findUnique({
            where: { email },
            include: {
                roles: {
                    include: { role: true },
                },
            },
        });
    }
    async findUserById(id) {
        return prisma.user.findUnique({
            where: { id },
            include: {
                roles: {
                    include: { role: true },
                },
            },
        });
    }
    async createUser(data) {
        return prisma.user.create({
            data,
            include: {
                roles: {
                    include: { role: true },
                },
            },
        });
    }
    async updateUserLastLogin(userId) {
        return prisma.user.update({
            where: { id: userId },
            data: { lastLogin: new Date() },
        });
    }
}
//# sourceMappingURL=auth.repository.js.map