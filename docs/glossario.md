# Glossário — Hexavante API

Documento de referência dos termos usados no código e nas rotas.

---

| Termo | Significado |
|-------|-------------|
| Sessão | `Session` de 7 dias identificada pelo cookie `__Secure-hexavante.session_token` |
| Fingerprint | `sha256(userAgent\|ip)` identificando um aparelho |
| Aparelho confiável | `TrustedDevice` não revogado — dispensa código (salvo 2FA) |
| 2FA | `twoFactorEnabled` — código por e-mail em todo login |
| Presença | `presence` manual + `lastSeenAt`; offline após 5 min (`effectivePresence`) |
| Temporada | `RankingSeason` vigente; sem ela (ou vazia) vale o ranking all-time |
| Moderação | Ações auditadas em `moderation_logs` com `ModerationLogType` |
| Moedas/XP | `UserWallet`/`CoinTransaction`, `UserXP`/`XpTransaction` |
| Publicação | `Course.status=APPROVED` / `isPublished=true` — único conteúdo listável |
