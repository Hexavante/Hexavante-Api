#!/bin/sh
set -e

if [ ! -f dist/server.js ]; then
  echo "ERRO: dist/server.js não encontrado. O build pode ter falhado."
  exit 1
fi

if [ -n "$DATABASE_URL" ]; then
  echo "Aplicando migrations do banco..."
  npx prisma migrate deploy
fi

echo "Iniciando Hexavante API..."
exec node dist/server.js
