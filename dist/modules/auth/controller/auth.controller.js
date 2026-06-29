import { UnauthorizedError } from '../../../lib/errors/AppError';
import { loginSchema, registerSchema } from '../schemas/auth.schemas';
import { validateBody } from '../../../lib/validation/validate';
export class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async login(request, reply) {
        await validateBody(loginSchema)(request, reply);
        const body = request.body;
        const user = await this.authService.validateCredentials(body.email, body.password);
        if (!user) {
            throw new UnauthorizedError('Credenciais inválidas');
        }
        const token = await this.authService.createToken(user.id, user.roles);
        reply.send({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                roles: user.roles,
            },
        });
    }
    async register(request, reply) {
        await validateBody(registerSchema)(request, reply);
        const body = request.body;
        const user = await this.authService.registerUser(body);
        const token = await this.authService.createToken(user.id, ['USER']);
        reply.status(201).send({
            token,
            user: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                username: user.username,
                roles: ['USER'],
            },
        });
    }
    async logout(request, reply) {
        // TODO: Implementar logout com invalidação de token
        reply.send({ success: true });
    }
    async refresh(request, reply) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedError('Token inválido ou ausente');
        }
        const token = authHeader.slice(7);
        const payload = await this.authService.verifyToken(token);
        const user = await this.authService.getUserById(payload.sub);
        if (!user) {
            throw new UnauthorizedError('Usuário não encontrado');
        }
        const newToken = await this.authService.createToken(user.id, user.roles.map((r) => r.role.name));
        reply.send({
            token: newToken,
            user: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                username: user.username,
                roles: user.roles.map((r) => r.role.name),
            },
        });
    }
    async getSession(request, reply) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedError('Token inválido ou ausente');
        }
        const token = authHeader.slice(7);
        const payload = await this.authService.verifyToken(token);
        const user = await this.authService.getUserById(payload.sub);
        if (!user) {
            throw new UnauthorizedError('Usuário não encontrado');
        }
        reply.send({
            user: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                username: user.username,
                roles: user.roles.map((r) => r.role.name),
            },
        });
    }
}
//# sourceMappingURL=auth.controller.js.map