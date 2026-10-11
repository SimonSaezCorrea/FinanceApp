#!/usr/bin/env bash
# Runs ON the EC2 server (/opt/fik/deploy.sh), triggered by GitHub Actions through AWS SSM:
#   sudo /opt/fik/deploy.sh <image-tag>
# Reads AWS_REGION and ECR_REGISTRY from /opt/fik/deploy.env.
#
# Zero-downtime: the API is never stopped before its replacement answers.
#   1. Render api.env, pull the image, apply migrations + catalogue (the old API keeps serving).
#   2. Start the NEW container NEXT TO the old one (compose scale +1, without recreating the old).
#      Caddy sends traffic to every "api" container it finds (deploy/Caddyfile).
#   3. Wait until the new one is healthy. If it never is, remove it: the old one never noticed.
#   4. Stop the old one gracefully (SIGTERM: it stops accepting, finishes what it has in progress,
#      up to 30 s) and remove it. A request refused meanwhile is retried by Caddy on the new one.
# Migrations still run BEFORE the switch: for a few seconds the old code works against the new
# schema, so a migration must not drop or rename what the previous version uses (expand first,
# contract in a later deploy).
set -euo pipefail

cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <image-tag>}"
# shellcheck source=/dev/null
source ./deploy.env
: "${AWS_REGION:?missing in deploy.env}" "${ECR_REGISTRY:?missing in deploy.env}"

export API_IMAGE="${ECR_REGISTRY}/fik-api:${TAG}"
echo "Deploying ${API_IMAGE}"

# api.env from Parameter Store /fik/prod/: a parameter added or changed there reaches the API on
# the next deploy. If it can't be rendered, stop before touching the running API.
bash ./render-api-env.sh

# The instance role grants read access to ECR: no stored credentials.
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker compose pull api
# Schema first: a migration that fails stops the deploy with the old API still running.
docker compose --profile tools run --rm migrate

# Caddy must be up, and picks up any Caddyfile change without dropping connections.
docker compose up -d --no-deps --no-recreate caddy
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

old_ids="$(docker compose ps -q api)"
old_count="$(printf '%s\n' "$old_ids" | grep -c . || true)"

echo "Starting the new API next to ${old_count} running one(s)..."
docker compose up -d --no-deps --no-recreate --scale "api=$((old_count + 1))" api

new_id=""
for id in $(docker compose ps -q api); do
  if ! grep -qx "$id" <<<"$old_ids"; then new_id="$id"; fi
done
if [ -z "$new_id" ]; then
  echo "Could not find the new API container." >&2
  exit 1
fi

echo "Waiting for the new API (${new_id:0:12}) to report healthy..."
status=""
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$new_id" 2>/dev/null || echo missing)"
  [ "$status" = "healthy" ] && break
  [ "$status" = "unhealthy" ] && break
  sleep 2
done

if [ "$status" != "healthy" ]; then
  echo "The new API did not become healthy (${status}); the old one keeps serving. Logs:" >&2
  docker logs --tail 80 "$new_id" >&2 || true
  docker rm -f "$new_id" >/dev/null || true
  exit 1
fi

# Let Caddy's DNS refresh (1 s) see the new container before the old one goes away.
sleep 3
for id in $old_ids; do
  echo "Stopping the previous API (${id:0:12}) gracefully..."
  docker stop --time 30 "$id" >/dev/null
  docker rm "$id" >/dev/null
done

echo "API healthy on ${TAG}"
docker image prune -af --filter "until=168h" >/dev/null || true
