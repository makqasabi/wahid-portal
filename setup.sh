#!/bin/bash
set -e
echo "=== Wahid Portal Setup ==="

cd /opt/wahid/wahid-portal

# 1. Environment
echo "Creating .env..."
cp .env.example .env
JWT1=$(openssl rand -base64 64 | tr -d '\n')
JWT2=$(openssl rand -base64 64 | tr -d '\n')
PGP=$(openssl rand -base64 32 | tr -d '\n')
sed -i "s|CHANGE_ME_generate_with_openssl_rand_base64_64|${JWT1}|" .env
sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT2}|" .env
sed -i "s|CHANGE_ME_strong_random_password|${PGP}|" .env
# Fix DATABASE_URL with actual password
sed -i "s|postgresql://postgres:CHANGE_ME_strong_random_password@|postgresql://postgres:${PGP}@|" .env

# 2. Switch to PostgreSQL
echo "Switching to PostgreSQL..."
sed -i 's/provider = "sqlite"/provider = "postgresql"/' backend/prisma/schema.prisma

# 3. Build and start
echo "Building containers (this takes a few minutes)..."
sudo docker compose up -d --build

# 4. Wait for DB
echo "Waiting for database..."
sleep 15

# 5. Run migrations and seed
echo "Setting up database..."
sudo docker compose exec -T backend npx prisma db push --accept-data-loss
sudo docker compose exec -T backend npx tsx prisma/seed.ts

# 6. Show status
echo ""
echo "============================================"
echo "  Wahid Portal is LIVE!"
echo "  http://95.177.171.54"
echo "============================================"
sudo docker compose ps
