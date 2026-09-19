# Escopo MVP (API)

## Dentro do escopo

Auth completa (senha, OAuth, sessão, dispositivo, 2FA, presença), catálogo publicado (cursos/simulados/tutoriais/stats), matrículas e progresso, simulados com histórico, certificados, gamificação (ranking/XP/conquistas), loja e inventário, instrutores, salas ao vivo, moderação auditada, notificações e conversas.

## Fora do escopo (futuro)

Pagamento real (apenas moedas virtuais), WebSockets próprios (polling/heartbeat), multi-tenant/instituições, SLA formal, sharding e réplicas de leitura.

## Critérios de aceite por entrega

`tsc` verde, testes do módulo verdes, `migrate diff` vazio se o schema mudou, endpoint testado via `curl` (feliz + erro), sem segredo commitado.
