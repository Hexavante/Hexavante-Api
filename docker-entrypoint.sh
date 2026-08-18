#!/bin/sh
set -e

if [ ! -f dist/server.js ]; then
  echo "ERRO: dist/server.js não encontrado. O build pode ter falhado."
  exit 1
fi

if [ -n "$DATABASE_URL" ]; then
  echo "Sincronizando schema do banco..."
  npx prisma db push --skip-generate 2>&1 || echo "Aviso: db push falhou, continuando..."
fi

echo "Iniciando Hexavante API..."
exec node dist/server.js
