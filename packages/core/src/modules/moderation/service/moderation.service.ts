import { AppError } from "../../../lib/errors/AppError";
import { ModerationRepository } from "../repository/moderation.repository";
import { ModerationUser, ModerationStats } from "../types/moderation.types";

export class ModerationService {
  constructor(private readonly moderationRepository: ModerationRepository) {}

  async listUsers(options: {
    search?: string;
    status?: string;
    role?: string;
    limit?: number;
  }): Promise<ModerationUser[]> {
    return this.moderationRepository.listUsers(options);
  }

  async getStats(): Promise<ModerationStats> {
    return this.moderationRepository.getStats();
  }

  async banUser(
    moderatorId: string,
    userId: string,
    input: { reason: string; durationHours?: number },
  ): Promise<void> {
    if (moderatorId === userId) {
      throw new AppError(400, "Você não pode banir a si mesmo");
    }

    const existing = await this.moderationRepository.findActiveBan(userId);
    if (existing) {
      throw new AppError(409, "Usuário já possui um banimento ativo");
    }

    const expiresAt = input.durationHours
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000)
      : undefined;

    await this.moderationRepository.banUser(userId, moderatorId, input.reason, expiresAt);
    await this.moderationRepository.writeLog({
      moderatorId,
      targetUserId: userId,
      action: "BAN",
      description: `Banimento: ${input.reason}`,
      metadata: { durationHours: input.durationHours ?? null },
    });
  }

  async unbanUser(moderatorId: string, userId: string): Promise<void> {
    const existing = await this.moderationRepository.findActiveBan(userId);
    if (!existing) {
      throw new AppError(404, "Usuário não está banido");
    }

    await this.moderationRepository.liftBan(existing.id, moderatorId);
    await this.moderationRepository.writeLog({
      moderatorId,
      targetUserId: userId,
      action: "UNBAN",
      description: "Banimento revogado",
    });
  }

  async muteUser(
    moderatorId: string,
    userId: string,
    input: { reason: string; durationHours?: number },
  ): Promise<void> {
    if (moderatorId === userId) {
      throw new AppError(400, "Você não pode silenciar a si mesmo");
    }

    const existing = await this.moderationRepository.findActiveMute(userId);
    if (existing) {
      throw new AppError(409, "Usuário já está silenciado");
    }

    const expiresAt = input.durationHours
      ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000)
      : undefined;

    await this.moderationRepository.muteUser(userId, moderatorId, input.reason, expiresAt);
    await this.moderationRepository.writeLog({
      moderatorId,
      targetUserId: userId,
      action: "MUTE",
      description: `Silenciamento: ${input.reason}`,
      metadata: { durationHours: input.durationHours ?? null },
    });
  }

  async unmuteUser(moderatorId: string, userId: string): Promise<void> {
    const existing = await this.moderationRepository.findActiveMute(userId);
    if (!existing) {
      throw new AppError(404, "Usuário não está silenciado");
    }

    await this.moderationRepository.liftMute(existing.id, moderatorId);
    await this.moderationRepository.writeLog({
      moderatorId,
      targetUserId: userId,
      action: "UNMUTE",
      description: "Silenciamento revogado",
    });
  }

  async warnUser(
    moderatorId: string,
    userId: string,
    input: { reason: string },
  ): Promise<void> {
    if (moderatorId === userId) {
      throw new AppError(400, "Você não pode advertir a si mesmo");
    }

    await this.moderationRepository.warnUser(userId, moderatorId, input.reason);
    await this.moderationRepository.writeLog({
      moderatorId,
      targetUserId: userId,
      action: "WARN",
      description: `Advertência: ${input.reason}`,
    });
  }
}