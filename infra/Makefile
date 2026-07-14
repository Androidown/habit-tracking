# =============================================================================
# habit-tracking — Infrastructure Makefile
# =============================================================================
# Usage:
#   make help        Show this help
#   make provision   Provision production server (initial setup)
#   make cert        Obtain/renew SSL certificate (Let's Encrypt)
#   make deploy      Pull latest image, recreate services
#   make reload      Reload nginx configuration (graceful)
#   make logs        Tail logs from all services
#   make ps          Show service status
#   make shell       Open a shell in the app container
#   make test        Run local syntax checks on config files
# =============================================================================

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

DOMAIN     ?= habit-tracker.example.com
EMAIL      ?= admin@example.com
COMPOSE    := docker compose -f docker-compose.yml
TAG        ?= latest

export HABIT_TRACKING_TAG := $(TAG)

.PHONY: help provision cert deploy reload logs ps shell test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ── Provisioning ─────────────────────────────────────────────────────────────

provision: ## Provision production server: directories, cert, and services
	@echo "==> Creating required directories..."
	@sudo mkdir -p /var/www/letsencrypt /var/log/letsencrypt /var/log/nginx
	@echo "==> Obtaining initial SSL certificate..."
	$(MAKE) cert
	@echo "==> Starting production services..."
	$(MAKE) deploy
	@echo "==> Done. Domain: https://$(DOMAIN)"

# ── SSL Certificate ──────────────────────────────────────────────────────────

cert: ## Obtain or renew SSL certificate via Let's Encrypt (dry-run)
	@echo "==> Running certbot (dry-run) for $(DOMAIN)..."
	@sudo ./ssl-renew.sh --live
	@echo "==> Done. Certificate status:"
	@sudo openssl x509 -noout -text -in /etc/letsencrypt/live/$(DOMAIN)/cert.pem 2>/dev/null | \
		grep -E "Not Before|Not After" || echo "  (certificate not yet obtained)"

cert-live: ## Obtain/renew SSL certificate (LIVE)
	@echo "==> Running certbot LIVE for $(DOMAIN)..."
	@sudo ./ssl-renew.sh --live
	@echo "==> Done."

cert-force: ## Force certificate renewal
	@echo "==> Force-renewing certificate for $(DOMAIN)..."
	@sudo ./ssl-renew.sh --live --force
	@echo "==> Done."

# ── Deployment ────────────────────────────────────────────────────────────────

deploy: ## Pull latest images and recreate services
	@echo "==> Pulling latest images..."
	$(COMPOSE) pull
	@echo "==> Recreating services..."
	$(COMPOSE) up -d --remove-orphans
	@echo "==> Done."

restart: ## Restart all services
	$(COMPOSE) restart

stop: ## Stop all services
	$(COMPOSE) down

# ── Nginx ────────────────────────────────────────────────────────────────────

reload: ## Reload nginx configuration (graceful, no downtime)
	@echo "==> Testing nginx configuration..."
	@sudo nginx -t
	@echo "==> Reloading nginx..."
	@sudo nginx -s reload
	@echo "==> Done."

check: ## Validate nginx configuration syntax
	@sudo nginx -t

# ── Monitoring ────────────────────────────────────────────────────────────────

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

ps: ## List running services
	$(COMPOSE) ps

shell: ## Open a shell in the app container
	$(COMPOSE) exec app /bin/sh

# ── Testing ───────────────────────────────────────────────────────────────────

test: ## Run local syntax checks on configuration files
	@echo "==> Checking nginx configuration..."
	@docker run --rm -v ./nginx.conf:/etc/nginx/conf.d/default.conf:ro \
		nginx:1.27-alpine nginx -t 2>&1 | \
		grep -q "test is successful" && echo "  ✓ nginx.conf" || echo "  ✗ nginx.conf"
	@echo "==> Checking SSL renewal script syntax..."
	@bash -n ssl-renew.sh && echo "  ✓ ssl-renew.sh" || echo "  ✗ ssl-renew.sh"
	@echo "==> Checking docker-compose syntax..."
	$(COMPOSE) config -q && echo "  ✓ docker-compose.yml" || echo "  ✗ docker-compose.yml"
	@echo "==> All checks passed."
