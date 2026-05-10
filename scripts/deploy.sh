#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Wahid Portal — Production Deployment Script
# Target: Ubuntu 22.04 VM  |  Domain: wahid.live
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOMAIN="${DOMAIN:-wahid.live}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@wahid.live}"

echo "==> Wahid Portal deployment starting..."
echo "    Domain : $DOMAIN"
echo "    Project: $PROJECT_DIR"
echo ""

# ── 1. Install Docker if not present ────────────────────────
if ! command -v docker &>/dev/null; then
    echo "==> Installing Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    echo "    Docker installed. You may need to log out and back in for group changes."
else
    echo "==> Docker already installed: $(docker --version)"
fi

# ── 2. Verify Docker Compose ────────────────────────────────
if ! docker compose version &>/dev/null; then
    echo "ERROR: docker compose plugin not found. Install docker-compose-plugin."
    exit 1
fi
echo "==> Docker Compose: $(docker compose version)"

# ── 3. Create .env if it doesn't exist ──────────────────────
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
    echo "==> Creating .env from .env.example..."
    cp .env.example .env

    # Generate random secrets
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    PG_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=')

    sed -i "s|CHANGE_ME_generate_with_openssl_rand_base64_64|${JWT_SECRET}|" .env
    # Second occurrence for refresh secret — use a different value
    sed -i "0,/JWT_REFRESH_SECRET=.*/s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" .env
    sed -i "s|CHANGE_ME_strong_random_password|${PG_PASSWORD}|g" .env
    sed -i "s|DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
    sed -i "s|CERTBOT_EMAIL=.*|CERTBOT_EMAIL=${CERTBOT_EMAIL}|" .env

    echo "    .env created with generated secrets."
    echo "    IMPORTANT: Review .env and update SMTP settings before going live."
else
    echo "==> .env already exists, skipping creation."
fi

# ── 4. Switch Prisma to PostgreSQL for production ────────────
SCHEMA_FILE="$PROJECT_DIR/backend/prisma/schema.prisma"
if grep -q 'provider = "sqlite"' "$SCHEMA_FILE" 2>/dev/null; then
    echo "==> Switching Prisma datasource from SQLite to PostgreSQL..."
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA_FILE"
    echo "    schema.prisma updated to use postgresql provider."
fi

# ── 5. Initial SSL bootstrap (self-signed for first start) ──
#    Nginx needs certs to start. We create dummy certs first,
#    then replace them with real Let's Encrypt certs.
echo "==> Bootstrapping SSL certificates..."

CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
if [ ! -f "$CERT_PATH/fullchain.pem" ]; then
    echo "    Creating temporary self-signed certificate..."
    sudo mkdir -p "$CERT_PATH"
    sudo openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$CERT_PATH/privkey.pem" \
        -out "$CERT_PATH/fullchain.pem" \
        -subj "/CN=$DOMAIN" 2>/dev/null
fi

# ── 6. Build and start all services ─────────────────────────
echo "==> Building and starting containers..."
docker compose up -d --build

echo "==> Waiting for services to be healthy..."
sleep 10

# ── 7. Obtain real Let's Encrypt certificates ────────────────
echo "==> Requesting Let's Encrypt certificate for $DOMAIN..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    && {
        echo "    SSL certificate obtained successfully."
        # Reload nginx to pick up real certs
        docker compose exec nginx nginx -s reload
        echo "    Nginx reloaded with Let's Encrypt certs."
    } || {
        echo "    WARNING: Certbot failed. The site is running with a self-signed cert."
        echo "    Run this manually after DNS is pointed to this server:"
        echo "      docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d $DOMAIN -d www.$DOMAIN --email $CERTBOT_EMAIL --agree-tos --no-eff-email"
        echo "      docker compose exec nginx nginx -s reload"
    }

# ── 8. Status ────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Wahid Portal deployment complete!"
echo "=========================================="
echo ""
docker compose ps
echo ""
echo "  HTTP:  http://$DOMAIN  (redirects to HTTPS)"
echo "  HTTPS: https://$DOMAIN"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f          # follow all logs"
echo "    docker compose logs -f backend  # backend logs only"
echo "    docker compose exec backend npx prisma studio  # DB GUI"
echo "    docker compose down             # stop everything"
echo ""
