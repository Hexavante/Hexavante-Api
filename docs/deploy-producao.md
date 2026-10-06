# Deploy em produção — Hexavante API

Documento de referência do deploy **implementado** na VPS.

---

> [!CAUTION]
> **Credencial comprometida — rotação obrigatória.**
> Uma senha REAL do banco ficou exposta em `docker-compose.yml` (campo `DATABASE_URL`
> do serviço `api`) e **deve ser considerada comprometida** — ela já apareceu no
> histórico do repositório. Ações requeridas **antes ou imediatamente após** o próximo deploy:
> 1. Definir senha NOVA no MySQL (`MYSQL_PASSWORD` / usuário `hexavante`, e `MYSQL_ROOT_PASSWORD`);
> 2. Se o Redis tiver senha, rotacioná-la também (`REDIS_PASSWORD` + `REDIS_URL`);
> 3. Atualizar `DATABASE_URL`/`AUTH_SECRET` no ambiente real (variáveis do host ou `.env` **não versionado**);
> 4. Nunca reutilizar a senha antiga em nenhum ambiente (deploy, CI, scripts, logs).
> Credenciais externas (OAuth, Mercado Pago, Resend, `AUTH_SECRET` de produção) devem ser
> gerenciadas fora do repositório e rotacionadas pelos seus respectivos painéis.

## Topologia

```
Internet ──HTTPS──▶ Nginx ──▶ 127.0.0.1:3045 ──▶ hexavante-api (node dist/server.js)
                                                    ├─ MySQL (hexavante-mysql:3306, rede interna hexavante-net)
                                                    └─ Redis (hexavante-redis:6379, rede interna hexavante-net)
```

MySQL (3306) e Redis (6379) **não têm portas publicadas** no `docker-compose.yml`:
comunicam-se com a API apenas pela rede interna `hexavante-net`. O único ponto
acessível de fora do Docker é a porta `3045` da API, atrás do Nginx.

## Passo a passo (`/opt/hexavante-api`)

```bash
git fetch origin && git reset --hard origin/main
docker build --no-cache -t hexavante-api .
docker stop hexavante-api && docker rm hexavante-api
docker run -d --name hexavante-api --network hexavante_default -p 3045:3045 \
  -e NODE_ENV=production -e PORT=3045 -e HOST=0.0.0.0 \
  -e DATABASE_URL='mysql://hexavante:<senha-%2F>@mysql:3306/hexavante' \
  -e AUTH_SECRET='...' -e REDIS_URL='redis://redis:6379' \
  -e AUTH_URL='https://api.hexavante.com.br' \
  -e WEB_URL='https://app.hexavante.com.br' \
  -e CORS_ORIGIN='https://hexavante.com.br,https://www.hexavante.com.br,https://app.hexavante.com.br,https://painel.hexavante.com.br' \
  -e GOOGLE_CLIENT_ID='...' -e GOOGLE_CLIENT_SECRET='...' \
  -e GITHUB_CLIENT_ID='...' -e GITHUB_CLIENT_SECRET='...' \
  -e RESEND_API_KEY='...' -e RESEND_FROM='Hexavante <seguranca@hexavante.com.br>' \
  --restart unless-stopped hexavante-api
```

O entrypoint roda `prisma db push` (recusa mudanças destrutivas sozinho) e sobe o server.

## Verificação

```bash
curl http://localhost:3045/                          # 200
curl http://localhost:3045/api/v1/platform/stats     # 200 + números
docker logs hexavante-api | grep -i "connected\|error"  # DB/Redis ok, sem error
```

## Rollback

Rebuild da tag/commit anterior e `run` igual; banco nunca sofre downgrade (só aditivo). Ver [der-logico.md](der-logico.md).
