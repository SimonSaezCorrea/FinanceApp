#!/usr/bin/env bash
# One-time setup of a fresh EC2 instance (Amazon Linux 2023, ARM/Graviton), run as root — e.g.
# from AWS Systems Manager → Session Manager (no SSH port needed):
#   sudo bash bootstrap-ec2.sh
# Installs Docker + the Compose plugin and prepares /opt/fik. The AWS CLI and the SSM agent ship
# with Amazon Linux 2023.
set -euo pipefail

dnf -y update
dnf -y install docker
systemctl enable --now docker

COMPOSE_VERSION="v2.29.7"
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version

mkdir -p /opt/fik/certs
chmod 700 /opt/fik /opt/fik/certs

# RDS certificate authority (lets the API verify the database's TLS certificate).
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o /opt/fik/certs/rds-global-bundle.pem
# Prisma's migration engine reads only the FIRST certificate of its sslcert file, so the 100+ CA
# bundle fails verification ("self-signed certificate in certificate chain"). It gets the one root
# that signs this database (CA rds-ca-rsa2048-g1) on its own: certs/rds-ca.pem.
RDS_REGION="${RDS_REGION:-us-east-2}"
tmp="$(mktemp -d)"
awk -v d="$tmp" '/BEGIN CERT/{n++} {print > (d "/" n ".pem")}' /opt/fik/certs/rds-global-bundle.pem
for f in "$tmp"/*.pem; do
  if openssl x509 -noout -subject -in "$f" | grep -q "${RDS_REGION} Root CA RSA2048 G1"; then
    cp "$f" /opt/fik/certs/rds-ca.pem
  fi
done
rm -rf "$tmp"
test -s /opt/fik/certs/rds-ca.pem || { echo "No RDS root CA for ${RDS_REGION}" >&2; exit 1; }
# Cloudflare's CA for Authenticated Origin Pulls (Caddy refuses clients without its certificate).
curl -fsSL https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem \
  -o /opt/fik/certs/origin-pull-ca.pem

echo "Bootstrap done. Next: copy docker-compose.yml, Caddyfile, deploy.sh, api.env, deploy.env"
echo "and certs/origin.pem + certs/origin.key into /opt/fik (see docs/DEPLOY.md)."
