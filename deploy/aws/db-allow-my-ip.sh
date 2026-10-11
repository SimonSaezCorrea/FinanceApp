#!/usr/bin/env bash
# Lets THIS machine reach the production database (DBeaver, psql, prisma) by opening port 5432 of
# the fik-db security group to its current public IPv4 only. Run it again whenever your IP changes:
# it removes the previous "dev-access" rule(s) first, so an old address does not stay allowed.
#   AWS_PROFILE=fik ./db-allow-my-ip.sh [label] [region]
#   AWS_PROFILE=fik ./db-allow-my-ip.sh --revoke   # remove every dev-access rule
# The label tells several people's rules apart (default: your OS user). The server's own access
# (5432 from the fik-api security group) is never touched. RDS requires TLS (rds.force_ssl).
set -euo pipefail

if [ "${1:-}" = "--revoke" ]; then MODE=revoke; LABEL=""; shift; else MODE=allow; LABEL="${1:-${USER:-${USERNAME:-dev}}}"; fi
REGION="${2:-${AWS_REGION:-us-east-2}}"
PREFIX="dev-access"

SG_ID="$(aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values=fik-db \
  --query 'SecurityGroups[0].GroupId' --output text)"
[ "$SG_ID" != "None" ] || { echo "Security group fik-db not found in $REGION" >&2; exit 1; }

# Rules to drop: every dev-access rule on revoke, only this label's on allow.
match="${PREFIX}"; [ "$MODE" = allow ] && match="${PREFIX}:${LABEL}"
old="$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$SG_ID" --output text \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\`].IpRanges[?starts_with(Description||'', '${match}')].CidrIp[]")"
for cidr in $old; do
  aws ec2 revoke-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=${cidr}}]" >/dev/null
  echo "removed ${cidr}"
done
[ "$MODE" = revoke ] && { echo "Done: no dev-access rule left on ${SG_ID}."; exit 0; }

IP="$(curl -4 -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Could not read your public IPv4" >&2; exit 1; }
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=${IP}/32,Description=${PREFIX}:${LABEL} $(date -u +%F)}]" >/dev/null
echo "allowed ${IP}/32 (${PREFIX}:${LABEL}) on ${SG_ID}"
