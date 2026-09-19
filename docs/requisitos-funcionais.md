# Requisitos Funcionais (API)

## Autenticação e segurança

- RF-01: Cadastro com e-mail/usuário únicos, senha ≥ 8, idade 13+.
- RF-02: Login por senha com sessão de 7 dias em cookie `httpOnly`.
- RF-03: Verificação por código de 6 dígitos (e-mail não confirmado, dispositivo novo, 2FA): 10 min, 5 tentativas, reenvio 60s, códigos coexistem.
- RF-04: 2FA opcional por usuário (ativar com confirmação, desligar autenticado).
- RF-05: Dispositivos confiáveis listáveis e revogáveis (revogar derruba sessões do aparelho).
- RF-06: OAuth Google/GitHub com auto-confiança de dispositivo e e-mail verificado.
- RF-07: Presença (`ONLINE/AWAY/STUDYING/DND/INVISIBLE`) + heartbeat; offline após 5 min.

## Conteúdo

- RF-08: Catálogo público paginado de cursos, simulados e tutoriais (só publicados).
- RF-09: Matrícula, progresso de aulas e favoritos/notas (autenticado).
- RF-10: Histórico, stats e evolução de simulados por usuário.
- RF-11: Certificados: emissão (100% do curso), listagem e verificação pública por código.
- RF-12: Estatísticas públicas da plataforma com cache de 60s.

## Engajamento e moderação

- RF-13: Ranking por temporada com fallback all-time; conquistas fixas + do usuário.
- RF-14: Loja, inventário, compra e equipamento de cosméticos.
- RF-15: Candidatura a instrutor, categorias, salas ao vivo, notificações e conversas.
- RF-16: Ações de moderação auditadas; rate-limit global e por rota.
