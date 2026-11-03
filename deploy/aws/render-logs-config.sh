#!/usr/bin/env bash
# Prepares the log collector (the `logs` service, Vector → Better Stack) on the EC2 server from
# Parameter Store /fik/logs/, the same way render-api-env.sh prepares the API. deploy.sh runs it
# before every deploy; by hand (root, on the server):
#   sudo bash /opt/fik/render-logs-config.sh
#
#   /fik/logs/INGESTING_HOST  String        the Better Stack source's ingesting host
#   /fik/logs/SOURCE_TOKEN    SecureString  the Better Stack source token
#
# Writes /opt/fik/logs/vector.yaml (the template /opt/fik/vector.yaml with the host filled in) and
# /opt/fik/logs/secrets/source_token. With either parameter missing it removes both and exits 0:
# deploy.sh then leaves the collector stopped and no log leaves the server. Kept apart from
# /fik/prod/ so the API never receives the token (render-api-env.sh passes every /fik/prod/ value).
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
PREFIX="/fik/logs"
DIR="/opt/fik/logs"
TEMPLATE="/opt/fik/vector.yaml"

read_param() {
  aws ssm get-parameter --region "$REGION" --name "${PREFIX}/$1" --with-decryption \
    --query 'Parameter.Value' --output text 2>/dev/null || true
}

host="$(read_param INGESTING_HOST)"
token="$(read_param SOURCE_TOKEN)"

if [ -z "$host" ] || [ -z "$token" ]; then
  rm -rf "$DIR"
  echo "Log shipping off: ${PREFIX}/INGESTING_HOST or ${PREFIX}/SOURCE_TOKEN is not set."
  exit 0
fi

# A bare host name, never a URL or anything that could rewrite the configuration.
if [[ ! "$host" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]]; then
  echo "${PREFIX}/INGESTING_HOST is not a host name; log shipping left as it was." >&2
  exit 1
fi

umask 077
mkdir -p "$DIR/secrets"
tmp="$(mktemp "$DIR/vector.yaml.XXXX")"
sed "s/__INGESTING_HOST__/${host}/" "$TEMPLATE" >"$tmp"
mv "$tmp" "$DIR/vector.yaml"
printf '%s' "$token" >"$DIR/secrets/source_token"
chmod 600 "$DIR/vector.yaml" "$DIR/secrets/source_token"
echo "Log shipping on: ${host}."
