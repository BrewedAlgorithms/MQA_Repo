#!/usr/bin/env zsh
# run.sh — MQA Development Runner (M1 Max)
#
# Starts MongoDB, MediaMTX, and both frontends inside Docker containers,
# then starts the FastAPI backend directly on the host.
#
# Why the backend runs on the host:
#   - Docker on macOS cannot access the GPU / Metal Performance Shaders (MPS).
#   - Running the backend (YOLO + pose models) on the host gives the pipeline
#     full MPS acceleration, which is significantly faster than CPU inference.
#
# Usage:
#   ./run.sh          — start everything
#   ./run.sh stop     — stop all Docker containers (backend must be Ctrl-C'd separately)

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV="$BACKEND_DIR/.venv"

# ── Colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo "${CYAN}[run.sh]${NC} $*"; }
ok()   { echo "${GREEN}[run.sh]${NC} $*"; }
warn() { echo "${YELLOW}[run.sh]${NC} $*"; }

# ── Stop mode ──────────────────────────────────────────────────────────────────
if [[ "${1}" == "stop" ]]; then
  log "Stopping Docker containers…"
  docker compose -f "$ROOT_DIR/docker-compose.yml" stop mongo mediamtx workers admin
  ok "Containers stopped. Backend (host process) must be stopped with Ctrl-C."
  exit 0
fi

# ── 1. Start infra + frontends in Docker ──────────────────────────────────────
log "Starting containers: mongo, mediamtx, workers, admin…"
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d mongo mediamtx workers admin
ok "Containers running."
echo ""
echo "  MongoDB   → localhost:27017"
echo "  MediaMTX  → RTSP :8554 | HLS :8888 | WebRTC :8889"
echo "  Workers   → http://localhost:5173"
echo "  Admin     → http://localhost:5174"
echo ""

# ── 2. Prepare Python venv on host ────────────────────────────────────────────
if [[ ! -d "$VENV" ]]; then
  log "Creating Python virtual environment…"
  python3 -m venv "$VENV"
fi

log "Installing / updating Python dependencies…"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
ok "Dependencies ready ($("$VENV/bin/python" --version))."

# ── 3. Load .env ───────────────────────────────────────────────────────────────
if [[ -f "$BACKEND_DIR/.env" ]]; then
  log "Loading $BACKEND_DIR/.env"
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_DIR/.env"
  set +a
else
  warn ".env not found in backend/. Ensure OPENAI_API_KEY is set in the environment."
fi

# ── 4. Override environment for host run ──────────────────────────────────────
# Point at the host-exposed MongoDB port (not the docker-internal hostname).
export MONGO_URI="mongodb://localhost:27017"
export MONGO_DB="${MONGO_DB:-mqa_db}"

# Use MPS (Metal Performance Shaders) for YOLO / pose inference on M1 Max.
# Overrides the container default ("cpu") to get GPU acceleration.
export YOLO_DEVICE="${YOLO_DEVICE:-mps}"
export POSE_DEVICE="${POSE_DEVICE:-mps}"

# ── 5. Start backend ───────────────────────────────────────────────────────────
ok "Starting backend on host with MPS…"
echo ""
echo "  Backend   → http://localhost:8001"
echo "  API docs  → http://localhost:8001/docs"
echo "  YOLO dev  → $YOLO_DEVICE"
echo "  Pose dev  → $POSE_DEVICE"
echo ""
log "Press Ctrl-C to stop the backend."
echo ""

cd "$BACKEND_DIR"
exec "$VENV/bin/uvicorn" app.main:app \
  --host 0.0.0.0 \
  --port 8001 \
  --reload
