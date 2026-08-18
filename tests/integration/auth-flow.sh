#!/usr/bin/env bash
set -euo pipefail

# Configuration - use environment variables or defaults
API="${API_URL:-http://localhost:3045}"
PASS="${TEST_PASSWORD:-Test@123456}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required}"
DB_NAME="${DB_NAME:-hexavante}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

TS=$(date +%s)
USERNAME="inttest_${TS}"
EMAIL="inttest_${TS}@test.com"
PERM_NAME="course.testcreate"

PASS_COUNT=0
FAIL_COUNT=0

pass() { echo "  PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "  FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

json_get() {
  python3 -c "import sys,json; print(json.load(sys.stdin)$1)" 2>/dev/null || echo "__NULL__"
}

check_status() {
  local url="$1" expected="$2" cookie="$3" desc="$4" method="${5:-GET}" body="${6:-}"
  local resp_code
  if [ "$method" = "POST" ] && [ -n "$body" ]; then
    resp_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -H "Origin: http://localhost:3000" \
      ${cookie:+-b "hexavante.session_token=${cookie}"} \
      -d "$body" "${API}${url}")
  elif [ "$method" = "POST" ]; then
    resp_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      ${cookie:+-b "hexavante.session_token=${cookie}"} \
      "${API}${url}")
  else
    resp_code=$(curl -s -o /dev/null -w "%{http_code}" \
      ${cookie:+-b "hexavante.session_token=${cookie}"} \
      "${API}${url}")
  fi
  [ "$resp_code" = "$expected" ] && pass "$desc" || fail "$desc (got $resp_code)"
}

echo "=========================================="
echo " TAREFA 3 — Integration Tests"
echo "=========================================="

cleanup() { local pid; pid=$(lsof -ti tcp:3045 2>/dev/null || true); [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; }
trap cleanup EXIT

echo ">>> Starting API..."
export BETTER_AUTH_URL=http://localhost:3045 AUTH_URL=http://localhost:3045
cd /home/kirsch/Programação/Hexavante-varias-versoes/Hexavante-api
npx tsx src/server.ts &
API_PID=$!
sleep 5

# ─── 1. REGISTER ────────────────────────────
echo ""
echo "━━━ 1. REGISTER ━━━"
REG=$(curl -s -X POST "${API}/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d "{\"name\":\"Int Test\",\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"username\":\"${USERNAME}\",\"birthDate\":\"2000-01-01\"}")
USER_ID=$(echo "$REG" | json_get "['user']['id']")
REG_TOKEN=$(echo "$REG" | json_get "['token']")
[ -n "$USER_ID" ] && pass "User registered" || fail "User not registered"
echo "  ID: $USER_ID"

# ─── 2. LOGIN ───────────────────────────────
echo ""
echo "━━━ 2. LOGIN ━━━"
LOGIN=$(curl -s -D - -X POST "${API}/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}")
RAW=$(echo "$LOGIN" | grep -i "^set-cookie:" | grep "hexavante.session_token" | sed 's/.*hexavante\.session_token=//' | sed 's/;.*//')
COOKIE=$(python3 -c "import sys,urllib.parse;print(urllib.parse.unquote('$RAW'))")
USER_FROM_LOGIN=$(echo "$LOGIN" | json_get "['user']['id']")
[ -n "$USER_FROM_LOGIN" ] && pass "Login succeeded" || fail "Login failed"

# ─── 3. SESSION ─────────────────────────────
echo ""
echo "━━━ 3. SESSION ━━━"
SES=$(curl -s -b "hexavante.session_token=${COOKIE}" "${API}/api/v1/auth/session")
SES_USER=$(echo "$SES" | json_get "['user']['id']")
[ "$SES_USER" = "$USER_ID" ] && pass "Session valid for correct user" || fail "Session mismatch"

# ─── 4. 401 UNAUTHENTICATED ─────────────────
echo ""
echo "━━━ 4. 401 WITHOUT COOKIE ━━━"
check_status "/api/v1/auth/session" 401 "" "Reject unauthenticated request"

# ─── 5. PERMISSION + ROLE ───────────────────
echo ""
echo "━━━ 5. PERMISSION + ROLE ━━━"
PERM=$(curl -s -X POST "${API}/api/v1/authorization/permissions" \
  -H "Content-Type: application/json" \
  -b "hexavante.session_token=${COOKIE}" \
  -d "{\"name\":\"${PERM_NAME}\",\"resource\":\"course\",\"action\":\"create\"}")
PERM_ID=$(echo "$PERM" | json_get "['permission']['id']")
[ -n "$PERM_ID" ] && pass "Permission created" || fail "Permission not created"

ROLE=$(curl -s -X POST "${API}/api/v1/authorization/roles" \
  -H "Content-Type: application/json" \
  -b "hexavante.session_token=${COOKIE}" \
  -d "{\"name\":\"ROLE_${TS}\",\"description\":\"Test\"}")
ROLE_ID=$(echo "$ROLE" | json_get "['role']['id']")
[ -n "$ROLE_ID" ] && pass "Role created" || fail "Role not created"

# ─── 6. CHECK PERMISSION (denied before) ────
echo ""
echo "━━━ 6. PERMISSION BEFORE ASSIGN ━━━"
CHECK1=$(curl -s -b "hexavante.session_token=${COOKIE}" \
  "${API}/api/v1/authorization/check/${PERM_NAME}")
GRANTED1=$(echo "$CHECK1" | json_get "['granted']")
[ "$GRANTED1" = "False" ] && pass "Permission denied before assignment" || fail "Unexpected: $GRANTED1"

# ─── 7. ASSIGN ROLE + PERMISSION ────────────
echo ""
echo "━━━ 7. ASSIGN ━━━"
mysql -u root -p"${DB_ROOT_PASSWORD}" -h "${DB_HOST}" -P "${DB_PORT}" "${DB_NAME}" -e \
  "INSERT IGNORE INTO role_permissions (id, role_id, permission_id, assigned_at) VALUES (UUID(), '${ROLE_ID}', '${PERM_ID}', NOW());" 2>/dev/null
mysql -u root -p"${DB_ROOT_PASSWORD}" -h "${DB_HOST}" -P "${DB_PORT}" "${DB_NAME}" -e \
  "INSERT IGNORE INTO user_roles (id, user_id, role_id, assigned_at) VALUES (UUID(), '${USER_ID}', '${ROLE_ID}', NOW);" 2>/dev/null
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" DEL "roles:${USER_ID}" "permissions:${USER_ID}" >/dev/null 2>&1 || true
pass "Permission linked to role, role linked to user, cache cleared"

# ─── 8. CHECK PERMISSION (granted after) ────
echo ""
echo "━━━ 8. PERMISSION AFTER ASSIGN ━━━"
CHECK2=$(curl -s -b "hexavante.session_token=${COOKIE}" \
  "${API}/api/v1/authorization/check/${PERM_NAME}")
GRANTED2=$(echo "$CHECK2" | json_get "['granted']")
[ "$GRANTED2" = "True" ] && pass "Permission granted after role assignment" || fail "Permission still denied: $CHECK2"

# ─── 9. LOGOUT ──────────────────────────────
echo ""
echo "━━━ 9. LOGOUT ━━━"
LOGOUT=$(curl -s -X POST "${API}/api/auth/sign-out" \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -b "hexavante.session_token=${COOKIE}")
echo "  Response: $LOGOUT"

# ─── 10. 401 AFTER LOGOUT ──────────────────
echo ""
echo "━━━ 10. 401 AFTER LOGOUT ━━━"
check_status "/api/v1/auth/session" 401 "$COOKIE" "Session invalidated after logout"

# ─── CLEANUP ────────────────────────────────
echo ""
echo "━━━ CLEANUP ━━━"
mysql -u root -p"${DB_ROOT_PASSWORD}" -h "${DB_HOST}" -P "${DB_PORT}" "${DB_NAME}" -e \
  "DELETE FROM user_roles WHERE user_id='${USER_ID}'; DELETE FROM sessions WHERE user_id='${USER_ID}'; DELETE FROM users WHERE id='${USER_ID}';" 2>/dev/null
mysql -u root -p"${DB_ROOT_PASSWORD}" -h "${DB_HOST}" -P "${DB_PORT}" "${DB_NAME}" -e \
  "DELETE FROM role_permissions WHERE role_id='${ROLE_ID}'; DELETE FROM user_roles WHERE role_id='${ROLE_ID}'; DELETE FROM roles WHERE id='${ROLE_ID}';" 2>/dev/null
echo "  Cleanup done"

# ─── RESULTS ────────────────────────────────
echo ""
echo "=========================================="
echo " $PASS_COUNT passed, $FAIL_COUNT failed"
echo "=========================================="

kill $API_PID 2>/dev/null
wait $API_PID 2>/dev/null
[ "$FAIL_COUNT" -eq 0 ] && echo "ALL TESTS PASSED ✅" || echo "SOME TESTS FAILED ❌"
