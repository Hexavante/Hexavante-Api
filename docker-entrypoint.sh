#!/bin/sh
set -e

API_ENTRY="${API_ENTRY:-dist/src/server.js}"

if [ ! -f "$API_ENTRY" ]; then
  echo "ERRO: $API_ENTRY não encontrado. O build pode ter falhado."
  exit 1
fi

echo "Iniciando Hexavante API..."
exec node "$API_ENTRY"
