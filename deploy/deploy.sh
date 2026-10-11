#!/usr/bin/env bash
# Runs ON the EC2 server (/opt/fik/deploy.sh), triggered by GitHub Actions through AWS SSM:
#   sudo /opt/fik/deploy.sh <image-tag>
# Pulls the image, applies migrations + catalogue, restarts the API and waits until it is healthy.
# Reads AWS_REGION and ECR_REGISTRY from /opt/fik/deploy.env.
set -euo pipefail

cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <image-tag>}"
# shellcheck source=/dev/null
source ./deploy.env
: "${AWS_REGION:?missing in deploy.env}" "${ECR_REGISTRY:?missing in deploy.env}"

export API_IMAGE="${ECR_REGISTRY}/fik-api:${TAG}"
echo "Deploying ${API_IMAGE}"

# The instance role grants read access to ECR: no stored credentials.
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker compose pull api
# Schema first: a migration that fails stops the deploy with the old API still running.
docker compose --profile tools run --rm migrate
docker compose up -d --remove-orphans api caddy

echo "Waiting for the API to report healthy..."
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "API healthy on ${TAG}"
    docker image prune -af --filter "until=168h" >/dev/null || true
    exit 0
  fi
  sleep 5
done

echo "API did not become healthy; last logs:" >&2
docker compose logs --tail 80 api >&2
exit 1
