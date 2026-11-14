import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOrCreateOAuthUser } from "../service/oauth.service";
const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  role: { findUnique: vi.fn() },
}));
vi.mock("../../../../packages/core/src/config/prisma", () => ({ prisma: db }));
const profile = { provider: "discord", providerId: "123", email: "outro@example.com", name: "Nome Igual", avatarUrl: null };
const result = { id: "user2", fullName: profile.name, username: "nomeigual_123", email: profile.email, roles: [], avatarUrl: null };
const conflict = Object.assign(new Error("unique constraint"), { code: "P2002" });
beforeEach(() => vi.resetAllMocks());
describe("cadastro OAuth", () => {
  it.each(["discord","google"])("trata nomes repetidos no %s", async (provider) => {
    db.account.findUnique.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValueOnce(conflict).mockResolvedValueOnce(result);
    expect((await findOrCreateOAuthUser({ ...profile, provider })).id).toBe("user2");
    const attempts = db.user.create.mock.calls.map(([args]) => args.data);
    expect(attempts[0].username).toBe("nomeigual");
    expect(attempts[1].username).toMatch(/^nomeigual_[0-9a-f]{8}$/);
    expect(attempts[1].accounts.create).toEqual({ providerId: provider, accountId:"123" });
    expect(db.account.create).not.toHaveBeenCalled();
  });
  it("reutiliza a conta se outro callback concluir primeiro",async()=>{
    db.account.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({user:result});
    db.user.create.mockRejectedValueOnce(conflict);
    expect((await findOrCreateOAuthUser(profile)).id).toBe("user2");
    expect(db.user.create).toHaveBeenCalledTimes(1);
  });
});
