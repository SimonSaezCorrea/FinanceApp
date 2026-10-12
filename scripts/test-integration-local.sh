#!/usr/bin/env bash
# Runs the API's integration + e2e tiers against a DISPOSABLE Postgres — the same steps as the
# "api" job in .github/workflows/ci.yml (migrate deploy, schema/migration drift check, catalogue
# seed, tests) — then tears it down. The dev database (fik-db on 5432) is never touched.
#
#   pnpm test:integration:local                       # integration + e2e
#   pnpm test:integration:local test/e2e/domains/debt # extra args go to vitest (paths, -t, …)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE="docker-compose.test.yml"
TEST_DB_PORT=5433
TEST_DB_URL="postgresql://fik_test:fik_test@localhost:${TEST_DB_PORT}/fik_test"

cleanup() {
  status=$?
  echo "==> Tearing down test Postgres"
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

echo "==> Starting disposable Postgres on port ${TEST_DB_PORT}"
docker compose -f "$COMPOSE_FILE" up -d --wait

# Every Prisma command, the seed and the tests read DATABASE_URL (the tests' setup-env loads
# apps/api/.env, but never over a variable already set). DIRECT_DATABASE_URL is cleared so a
# value in the shell can't send the migrations elsewhere; the other secrets come from .env.
export DATABASE_URL="$TEST_DB_URL"
export TEST_DATABASE_URL="$TEST_DB_URL"
unset DIRECT_DATABASE_URL
export NODE_ENV=test

echo "==> Building the packages the API imports"
pnpm --filter "@finance/api^..." build >/dev/null

echo "==> Applying migrations"
pnpm --filter @finance/api exec prisma migrate deploy

echo "==> Checking schema.prisma has its migration"
pnpm --filter @finance/api exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code

echo "==> Seeding the catalogue"
pnpm --filter @finance/api prisma:seed >/dev/null

echo "==> Running integration + e2e tests"
if [ "$#" -gt 0 ]; then
  pnpm --filter @finance/api exec vitest run "$@"
else
  pnpm --filter @finance/api exec vitest run test/integration test/e2e
fi
