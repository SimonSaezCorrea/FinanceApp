#!/usr/bin/env bash
# Opens a tunnel from THIS machine to the production database through the fik-api server, using
# Session Manager port forwarding. The database has no public address: nothing outside the VPC can
# reach it, and the server is the only machine its security group lets in. No SSH, no open port.
#   AWS_PROFILE=fik ./db-tunnel.sh [local-port] [region]
# Then point DBeaver/psql at localhost:<local-port> (default 15432, so it never collides with the
# local development Postgres on 5432). The tunnel lasts while this command runs; Ctrl+C closes it.
# Needs the AWS CLI logged in and the Session Manager plugin installed
# (https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).
# RDS requires TLS (rds.force_ssl): use SSL mode verify-ca, since the certificate names the RDS
# host, not localhost.
set -euo pipefail

LOCAL_PORT="${1:-15432}"
REGION="${2:-${AWS_REGION:-us-east-2}}"

command -v session-manager-plugin >/dev/null 2>&1 || {
  echo "Session Manager plugin not found. Install it first (Windows: winget install Amazon.SessionManagerPlugin)." >&2
  exit 1
}

INSTANCE_ID="$(aws ec2 describe-instances --region "$REGION" \
  --filters Name=tag:Name,Values=fik-api Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
[ "$INSTANCE_ID" != "None" ] || { echo "Running instance fik-api not found in $REGION" >&2; exit 1; }

DB_HOST="$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier fik-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)"

echo "Tunnel: localhost:${LOCAL_PORT} -> ${DB_HOST}:5432 via ${INSTANCE_ID}. Ctrl+C to close."
MSYS_NO_PATHCONV=1 aws ssm start-session --region "$REGION" --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${DB_HOST},portNumber=5432,localPortNumber=${LOCAL_PORT}"
