#!/usr/bin/env bash
#
# deploy.sh — Deploy the latest application image to the production server.
#
# Prerequisites:
#   - Docker & Docker Compose installed on the target host
#   - Logged in to the container registry (e.g. `docker login ghcr.io`)
#   - Environment variables below exported or passed via CI secrets
#
# Usage:
#   ./scripts/deploy.sh
#
# Required environment variables:
#   DEPLOY_HOST        — SSH hostname of the production server
#   DEPLOY_USER        — SSH user
#   DEPLOY_SSH_KEY     — SSH private key (path or content)
#   IMAGE_TAG          — Full image tag to deploy (e.g. ghcr.io/org/repo:sha-abc1234)
#
# Optional:
#   DEPLOY_PORT        — SSH port (default: 22)
#   COMPOSE_DIR        — Directory on the server where docker-compose.yml lives (default: /opt/habit-tracking)
# =============================================================================

set -euo pipefail

# ---- Configuration ----------------------------------------------------------
SSH_PORT="${DEPLOY_PORT:-22}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/habit-tracking}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "[${TIMESTAMP}] Starting deployment of ${IMAGE_TAG} to ${DEPLOY_HOST}..."

# ---------------------------------------------------------------------------
# 1. Copy docker-compose.yml & .env to the remote server
# ---------------------------------------------------------------------------
echo "[${TIMESTAMP}] Synchronizing compose files..."
scp -P "${SSH_PORT}" -o StrictHostKeyChecking=accept-new \
  ./docker-compose.yml \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${COMPOSE_DIR}/docker-compose.yml"

# Optionally copy .env if it exists locally (secrets should come from CI env)
if [ -f .env ]; then
  scp -P "${SSH_PORT}" \
    .env \
    "${DEPLOY_USER}@${DEPLOY_HOST}:${COMPOSE_DIR}/.env"
fi

# ---------------------------------------------------------------------------
# 2. Pull the latest image and restart services on the remote server
# ---------------------------------------------------------------------------
ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
  set -euo pipefail
  echo "[deploy] Pulling image: ${IMAGE_TAG}"
  docker pull "${IMAGE_TAG}"

  cd "${COMPOSE_DIR}"

  echo "[deploy] Stopping current containers..."
  docker compose down --timeout 30 || true

  echo "[deploy] Starting services with the new image..."
  docker compose up -d --remove-orphans

  echo "[deploy] Waiting for health check..."
  for i in \$(seq 1 12); do
    if docker compose ps --format json | grep -q '"Health":"healthy"'; then
      echo "[deploy] Service is healthy!"
      break
    fi
    echo "[deploy] Health check attempt \$i/12..."
    sleep 5
  done

  echo "[deploy] Cleaning up old images..."
  docker image prune -f --filter "until=24h"

  echo "[deploy] Deployment complete."
EOF

echo "[${TIMESTAMP}] Deployment finished successfully."
