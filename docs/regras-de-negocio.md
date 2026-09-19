# Regras de negócio — Hexavante API

Documento de referência das regras **implementadas** no código.

---

| ID | Regra | Onde |
|----|-------|------|
| RN-01 | E-mail e username únicos (e-mail case-insensitive) | `auth.service signUp` |
| RN-02 | Conta sem e-mail confirmado não recebe sessão — recebe `202` | `auth.service signIn` |
| RN-03 | Aparelho só é confiável após código correto; OAuth confia automaticamente | `security.service` |
| RN-04 | Fingerprint = `sha256(userAgent\|ip)`; clientes server-side **devem** repassar UA/IP reais (`deviceUa`/`deviceIp`) | `security.service`, controllers |
| RN-05 | 2FA ativo exige código em **todo** login, mesmo em aparelho conhecido | `signIn` |
| RN-06 | Código errado 5x invalida o código; reenvio só após 60s | `consumeCode`, `resendCode` |
| RN-07 | Revogar aparelho encerra as sessões daquele IP+UA | `revokeDevice` |
| RN-08 | Listas públicas mostram apenas `isPublished`/`APPROVED`; rascunho dá 404 | services de conteúdo |
| RN-09 | Certificado exige 100% do curso e matrícula ativa; código único | `certificate.service` |
| RN-10 | Ranking usa temporada ativa; vazia/ausente → fallback all-time por XP total | `ranking.service` |
| RN-11 | Compra exige saldo (ou Premium quando aplicável); equipamento respeita expiração | `shop.service` |
| RN-12 | `request.ip` depende de `trustProxy: true` (nginx); sem isso, tudo parece vir do IP interno | `server.ts` |
