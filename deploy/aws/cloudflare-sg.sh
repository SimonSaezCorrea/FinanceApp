#!/usr/bin/env bash
# Opens port 443 of the API's security group to Cloudflare's IP ranges ONLY (and nothing else):
# nobody can reach the server without going through Cloudflare.
#   ./cloudflare-sg.sh <security-group-id> [region]
# Run it from a machine with the AWS CLI configured (or AWS CloudShell). Safe to re-run: ranges
# already present are skipped. Cloudflare rarely changes them; re-run it every few months.
set -euo pipefail

SG_ID="${1:?usage: cloudflare-sg.sh <security-group-id> [region]}"
REGION="${2:-sa-east-1}"

add_range() {
  local family="$1" cidr="$2" out
  if [ "$family" = "v4" ]; then
    perm="IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=${cidr},Description=Cloudflare}]"
  else
    perm="IpProtocol=tcp,FromPort=443,ToPort=443,Ipv6Ranges=[{CidrIpv6=${cidr},Description=Cloudflare}]"
  fi
  if out="$(aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions "$perm" 2>&1)"; then
    echo "added   ${cidr}"
  elif grep -q "InvalidPermission.Duplicate" <<<"$out"; then
    echo "present ${cidr}"
  else
    echo "$out" >&2
    exit 1
  fi
}

for cidr in $(curl -fsS https://www.cloudflare.com/ips-v4); do add_range v4 "$cidr"; done
for cidr in $(curl -fsS https://www.cloudflare.com/ips-v6); do add_range v6 "$cidr"; done
echo "Done. Port 443 of ${SG_ID} is open to Cloudflare only."
