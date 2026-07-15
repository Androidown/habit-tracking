#!/usr/bin/env bash
# =============================================================================
# ssl-renew.sh — Let's Encrypt Certificate Auto-Renewal
# =============================================================================
# Usage:
#   ./ssl-renew.sh                    # Dry-run (no actual renewal)
#   ./ssl-renew.sh --live             # Perform renewal and reload nginx
#   ./ssl-renew.sh --force            # Force renewal even if not due
#   ./ssl-renew.sh --cron             # Called by systemd timer / cron
#
# Designed to be run as a daily cron job or systemd timer.
# The --cron flag enables silent operation (only output on errors).
# =============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-habit-tracker.example.com}"
EMAIL="${EMAIL:-admin@example.com}"
WEBROOT="/var/www/letsencrypt"
CERTBOT_BIN="${CERTBOT_BIN:-/usr/bin/certbot}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-nginx -s reload}"
LOG_FILE="${LOG_FILE:-/var/log/letsencrypt/ssl-renew.log}"
SILENT=false
LIVE=false
FORCE=false

# ── Parse arguments ──────────────────────────────────────────────────────────

for arg in "$@"; do
    case "$arg" in
        --cron)  SILENT=true  ;;
        --live)  LIVE=true    ;;
        --force) FORCE=true   ;;
        --help)
            echo "Usage: $0 [--live] [--force] [--cron]"
            exit 0
            ;;
    esac
done

# ── Logging ──────────────────────────────────────────────────────────────────

log() {
    local level="$1"
    shift
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
    echo "$msg" | tee -a "$LOG_FILE" >&2
}

# ── Pre-flight checks ────────────────────────────────────────────────────────

if [ ! -f "$CERTBOT_BIN" ]; then
    log "ERROR" "certbot not found at $CERTBOT_BIN"
    exit 1
fi

# Ensure webroot exists
if [ ! -d "$WEBROOT" ]; then
    mkdir -p "$WEBROOT"
    log "INFO" "Created webroot directory: $WEBROOT"
fi

# Ensure log directory exists
LOG_DIR="$(dirname "$LOG_FILE")"
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
fi

# ── Check if certificate exists and is due for renewal ────────────────────────

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
RENEW_DAYS_BEFORE=30

if [ -d "$CERT_DIR" ] && [ "$FORCE" = false ]; then
    if [ -f "${CERT_DIR}/cert.pem" ]; then
        EXPIRY=$(openssl x509 -enddate -noout -in "${CERT_DIR}/cert.pem" | cut -d= -f2)
        EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
        NOW_EPOCH=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

        if [ "$DAYS_LEFT" -gt "$RENEW_DAYS_BEFORE" ]; then
            if [ "$SILENT" = false ]; then
                log "INFO" "Certificate for $DOMAIN expires in ${DAYS_LEFT} days — renewal not needed yet (threshold: ${RENEW_DAYS_BEFORE} days)"
            fi
            exit 0
        fi

        log "INFO" "Certificate for $DOMAIN expires in ${DAYS_LEFT} days — renewal due"
    fi
elif [ "$FORCE" = true ]; then
    log "INFO" "Force renewal requested for $DOMAIN"
fi

# ── Run certbot ───────────────────────────────────────────────────────────────

CERTBOT_ARGS=(
    certonly
    --webroot
    --webroot-path "$WEBROOT"
    --domain "$DOMAIN"
    --email "$EMAIL"
    --agree-tos
    --non-interactive
    --keep-until-expiring
)

# Dry-run mode (no live renewal)
if [ "$LIVE" = false ]; then
    CERTBOT_ARGS+=(--dry-run)
    log "INFO" "Running certbot in dry-run mode for $DOMAIN"
else
    log "INFO" "Running certbot in LIVE mode for $DOMAIN"
fi

if [ "$FORCE" = true ]; then
    CERTBOT_ARGS+=(--force-renewal)
fi

# Hook to reload nginx on success
CERTBOT_ARGS+=(
    --deploy-hook "$NGINX_RELOAD_CMD"
)

set +e
"$CERTBOT_BIN" "${CERTBOT_ARGS[@]}"
CERTBOT_EXIT=$?
set -euo pipefail

# ── Handle result ────────────────────────────────────────────────────────────

case "$CERTBOT_EXIT" in
    0)
        log "INFO" "certbot succeeded for $DOMAIN"
        if [ "$LIVE" = true ]; then
            log "INFO" "Reloading nginx..."
            eval "$NGINX_RELOAD_CMD"
            log "INFO" "nginx reloaded successfully"
        fi
        ;;
    1)
        log "ERROR" "certbot encountered an unexpected error for $DOMAIN"
        ;;
    *)
        log "INFO" "certbot exited with code $CERTBOT_EXIT (may be 'no renewal needed')"
        ;;
esac

exit $CERTBOT_EXIT
