#!/usr/bin/env bash
# Local development runner for Telemed.
#
#   ./run.sh             install anything missing, prepare the database, start API + web app
#   ./run.sh setup       install dependencies and create backend/.env and frontend/.env
#   ./run.sh db          create the database/tables and seed data
#   ./run.sh demo-call   create a confirmed appointment that starts now (to test a video call)
#   ./run.sh backend     start only the API      (http://localhost:8000, docs at /docs)
#   ./run.sh frontend    start only the web app  (http://localhost:5173)
#   ./run.sh test        backend tests + frontend production build
#                        (integration tests need TEST_DATABASE_URL; that database is wiped)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

info() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

find_python() {
  for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1 &&
      "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      echo "$candidate"
      return
    fi
  done
  fail "Python 3.10 or newer is required."
}

setup_backend() {
  if [ ! -x "$VENV/bin/python" ]; then
    info "Creating Python virtual environment"
    "$(find_python)" -m venv "$VENV"
  fi

  # Reinstall only when requirements.txt changes.
  local stamp="$VENV/.requirements.sha" hash
  hash="$(shasum "$BACKEND/requirements.txt" | cut -d' ' -f1)"
  if [ "$(cat "$stamp" 2>/dev/null)" != "$hash" ]; then
    info "Installing backend dependencies"
    "$VENV/bin/pip" install --quiet --upgrade pip
    "$VENV/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
    echo "$hash" >"$stamp"
  fi

  if [ ! -f "$BACKEND/.env" ]; then
    info "Creating backend/.env (random JWT secret, local time zone, development passwords)"
    local secret tz
    secret="$("$VENV/bin/python" -c 'import secrets; print(secrets.token_urlsafe(48))')"
    tz="$(readlink /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##' || true)"
    sed -e "s#^JWT_SECRET=.*#JWT_SECRET=${secret}#" \
      -e "s#^CLINIC_TIMEZONE=.*#CLINIC_TIMEZONE=${tz:-UTC}#" \
      -e "s#^ADMIN_PASSWORD=.*#ADMIN_PASSWORD=Admin@12345#" \
      -e "s#^DEMO_PASSWORD=.*#DEMO_PASSWORD=Demo@12345#" \
      "$BACKEND/.env.example" >"$BACKEND/.env"
  fi
}

setup_frontend() {
  command -v npm >/dev/null 2>&1 || fail "Node.js 18+ and npm are required."
  if [ ! -d "$FRONTEND/node_modules" ] || [ "$FRONTEND/package.json" -nt "$FRONTEND/node_modules/.package-lock.json" ]; then
    info "Installing frontend dependencies"
    (cd "$FRONTEND" && npm install --no-audit --no-fund)
  fi
  [ -f "$FRONTEND/.env" ] || cp "$FRONTEND/.env.example" "$FRONTEND/.env"
}

check_database_url() {
  if grep -q '^DATABASE_URL=.*change-me' "$BACKEND/.env"; then
    fail "Set DATABASE_URL in backend/.env to your MySQL credentials, e.g.
       DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@127.0.0.1:3306/telemedicine
       (the database itself is created automatically), then run ./run.sh again."
  fi
}

prepare_db() {
  check_database_url
  info "Preparing database"
  (cd "$BACKEND" && "$VENV/bin/python" -m app.database.init_db "$@")
}

start_backend() { (cd "$BACKEND" && exec "$VENV/bin/uvicorn" app.main:app --reload --reload-dir app --port "$API_PORT"); }
start_frontend() { (cd "$FRONTEND" && exec npm run dev -- --port "$WEB_PORT" --strictPort); }

run_all() {
  setup_backend
  setup_frontend
  prepare_db
  ensure_port_free "$API_PORT" "API"
  ensure_port_free "$WEB_PORT" "web app"
  info "API:     http://localhost:$API_PORT  (interactive docs: /docs)"
  info "Web app: http://localhost:$WEB_PORT   — press Ctrl+C to stop both"
  start_backend &
  API_PID=$!
  start_frontend &
  WEB_PID=$!
  trap stop_servers INT TERM EXIT

  # If either server exits (e.g. it crashed), stop the other one too.
  while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
    sleep 1
  done
  if ! kill -0 "$API_PID" 2>/dev/null; then
    fail "The API server stopped; see the error above."
  fi
  fail "The web server stopped; see the error above."
}

# Globals (not locals) so the EXIT trap can still see them after run_all returns.
API_PID=""
WEB_PID=""
stop_servers() {
  trap - INT TERM EXIT
  local pid
  for pid in $API_PID $WEB_PID; do
    # uvicorn --reload and npm start child processes; stop them before their parent.
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

ensure_port_free() {
  local port="$1" name="$2" pid command
  # lsof exits 1 when nothing is listening; that must not trip `set -e`.
  pid="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  [ -z "$pid" ] && return 0
  command="$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-80)"
  fail "Port $port ($name) is already in use by PID $pid: $command
       Stop it with:  kill $pid
       or use another port, e.g. API_PORT=8001 ./run.sh (and set VITE_PROXY_TARGET=http://localhost:8001 in frontend/.env)"
}

case "${1:-}" in
  "") run_all ;;
  setup) setup_backend && setup_frontend && info "Setup complete. Check DATABASE_URL in backend/.env." ;;
  db) setup_backend && prepare_db ;;
  demo-call) setup_backend && prepare_db --demo-call ;;
  backend) setup_backend && check_database_url && ensure_port_free "$API_PORT" "API" && start_backend ;;
  frontend) setup_frontend && ensure_port_free "$WEB_PORT" "web app" && start_frontend ;;
  test)
    setup_backend
    setup_frontend
    info "Backend tests"
    (cd "$BACKEND" && "$VENV/bin/python" -m pytest -q)
    info "Frontend production build"
    (cd "$FRONTEND" && npm run build)
    ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
