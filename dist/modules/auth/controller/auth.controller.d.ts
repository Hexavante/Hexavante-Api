import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../service/auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    register(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    logout(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    refresh(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    getSession(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
//# sourceMappingURL=auth.controller.d.ts.map