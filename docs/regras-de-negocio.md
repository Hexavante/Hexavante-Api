# Regras de Negócio (API)

- RN-01: E-mail e username únicos (case-insensitive no e-mail).
- RN-02: Conta sem e-mail confirmado não recebe sessão por senha — recebe `202` para verificação.
- RN-03: Dispositivo só é confiável após código correto; OAuth confia automaticamente.
- RN-04: Fingerprint = `sha256(userAgent|ip)`; clientes server-side **devem** repassar UA/IP reais (`deviceUa`/`deviceIp`), senão todos colidem.
- RN-05: 2FA ativo exige código em **todo** login, mesmo em aparelho conhecido.
- RN-06: Código errado 5x invalida o código; reenvio só após 60s.
- RN-07: Revogar dispositivo encerra as sessões daquele IP+UA.
- RN-08: Listas públicas mostram apenas `isPublished`/`APPROVED`; detalhe de rascunho dá 404.
- RN-09: Certificado exige 100% do curso e matrícula ativa; código único.
- RN-10: Ranking usa temporada ativa; vazia/ausente → fallback all-time por XP total.
- RN-11: Compra exige saldo (ou Premium quando aplicável); equipamento respeita expiração.
- RN-12: `request.ip` depende de `trustProxy: true` (nginx); sem isso, tudo parece vir do IP interno.
