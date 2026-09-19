# Deploy em Produção (API)

## Topologia

```
Internet ──HTTPS──▶ Nginx ──▶ 127.0.0.1:3045 ──▶ hexavante-api (node dist/server.js)
                                                    ├─ MySQL (hexavante-mysql:3306)
                                                    └─ Redis (hexavante-redis:6379)
```

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
  -e CORS_ORIGIN='https://hexavante.com.br,https://www.hexavante.com.br,https://app.hexavante.com.br' \
  -e GOOGLE_CLIENT_ID='...' -e GOOGLE_CLIENT_SECRET='...' \
  -e GITHUB_CLIENT_ID='...' -e GITHUB_CLIENT_SECRET='...' \
  -e RESEND_API_KEY='...' -e RESEND_FROM='Hexavante <seguranca@hexavante.com.br>' \
  --restart unless-stopped hexavante-api
```

O entrypoint roda `prisma db push` (recusa mudanças destrutivas sozinho) e sobe o server.

## Verificação

```bash
curl http://localhost:3045/                                        # 200
curl http://localhost:3045/api/v1/platform/stats                   # 200 + números
docker logs hexavante-api | grep -i "connected\|error"             # DB/Redis ok, sem error
```

## Rollback

Rebuild da tag/commit anterior e `run` igual; banco nunca sofre downgrade (só aditivo).
