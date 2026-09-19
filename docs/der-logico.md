# DER Lógico (API)

O schema (`prisma/schema.prisma`) é o **espelho exato** do banco `hexavante` — mesma cobertura do schema do web (models, campos, tipos, defaults, `@map`, enums, índices e PKs, incluindo a PK composta de `tutorial_tags`).

## Tabelas-chave e mapas

| Model | Tabela | Observações |
|---|---|---|
| `User` | `users` | `two_factor_enabled`, `presence`, `last_seen_at`, `banner_url` |
| `Session` | `sessions` | `session_token` único; `user_id` indexado |
| `TrustedDevice` | `trusted_devices` | `@@unique([userId, fingerprint])` |
| `DeviceVerificationCode` | `device_verification_codes` | `purpose` (DEVICE/TWO_FACTOR/EMAIL_VERIFY), `attempts` |
| `Tutorial`/`Tag`/`TutorialTag`/`CourseTag` | `tutorials`, `tags`, `...` | Espelham tabelas criadas pelo web |
| `RankingSeasonResult` | `ranking_season_results` | `@@unique([userId, seasonKey])` |

## Convenções

- `snake_case` no banco via `@map`; `cuid()` nos ids; `DateTime` com mapas.
- Enums alinhados com o web (`ModerationLogType`, `StoreItemCategory`...).
- Índices nomeados (`map:`) replicados 1:1 — criados via `db push`, nunca à mão.
