import { ConflictError, NotFoundError } from "../../../lib/errors/AppError";
import type { IUserRepository } from "../repository/user.repository";
import type { UpdateProfileInput } from "../schemas/user.schemas";
import type { UserProfile } from "../types/user.types";

export class UserService {
  constructor(private readonly userRepository: IUserRepository) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Usuário não encontrado");
    }
    return user;
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileInput,
  ): Promise<UserProfile> {
    if (data.username) {
      const existing = await this.userRepository.findByUsername(data.username);
      if (existing && existing.id !== userId) {
        throw new ConflictError("Este nome de usuário já está em uso");
      }
    }

    const user = await this.userRepository.update(userId, data);
    return user;
  }

  async softDelete(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("Usuário não encontrado");
    }

    await this.userRepository.softDelete(userId);
  }
}
