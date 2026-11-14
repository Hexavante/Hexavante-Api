#!/usr/bin/env bash
# Muda a política de memória do Redis de produção para `noeviction`,
# obrigatória para as filas BullMQ (ver docs/migracao-gamificacao.md).
#
# Rodar NO VPS, manualmente, por quem administra o servidor:
#   bash redis-noeviction.sh           # só mostra o estado atual
#   bash redis-noeviction.sh --apply   # aplica a mudança
#
# Variáveis opcionais: REDIS_CONTAINER (padrão hexavante-redis) e
# REDIS_PASSWORD (se o Redis exigir senha).
set -euo pipefail

CONTAINER="${REDIS_CONTAINER:-hexavante-redis}"
AUTH=()
if [[ -n "${REDIS_PASSWORD:-}" ]]; then AUTH=(-a "$REDIS_PASSWORD" --no-auth-warning); fi

cli() { docker exec "$CONTAINER" redis-cli "${AUTH[@]}" "$@"; }

echo "== Estado atual ($CONTAINER)"
echo "política:      $(cli CONFIG GET maxmemory-policy | tail -1)"
echo "maxmemory:     $(cli CONFIG GET maxmemory | tail -1) bytes"
echo "em uso:        $(cli INFO memory | grep '^used_memory_human' | cut -d: -f2 | tr -d '\r')"
echo "chaves sem TTL: $(cli --scan --count 1000 | head -5000 | while read -r k; do [[ "$(cli TTL "$k")" == "-1" ]] && echo "$k"; done | wc -l) (amostra de até 5000)"

if [[ "${1:-}" != "--apply" ]]; then
  echo
  echo "Nada foi alterado. Rode com --apply para mudar para noeviction."
  exit 0
fi

cli CONFIG SET maxmemory-policy noeviction >/dev/null
echo
echo "== Aplicado: política agora é $(cli CONFIG GET maxmemory-policy | tail -1)"
echo
echo "ATENÇÃO: CONFIG SET vale até o container reiniciar. Para persistir,"
echo "troque '--maxmemory-policy allkeys-lru' por '--maxmemory-policy noeviction'"
echo "no comando com que o container é criado. Comando atual:"
docker inspect -f '{{join .Config.Cmd " "}}' "$CONTAINER"
echo
echo "Rollback: docker exec $CONTAINER redis-cli CONFIG SET maxmemory-policy allkeys-lru"
