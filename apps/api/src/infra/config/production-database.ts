/**
 * Refuses to touch the production database from anything that is not production itself.
 *
 * Production runs on Amazon RDS; every other environment (a laptop, CI, the test suites) runs on
 * its own PostgreSQL. A local `.env` pointed at RDS by mistake — or a pasted URL — would otherwise
 * let a local API write real rows, its jobs sweep real sessions, or `prisma migrate dev` offer to
 * RESET the real schema. So the API (`PrismaService`), the Prisma CLI (`prisma.config.ts`, every
 * migrate command) and the seed all stop before connecting when a database URL points at RDS and
 * `NODE_ENV` is not `production`. The server's image sets `NODE_ENV=production`; doing something
 * deliberate against production from a laptop means typing `NODE_ENV=production` on purpose.
 * Looking at the data is DBeaver's job, with the read-only user (docs/DEPLOY.md).
 *
 * Plain functions, no Nest: `prisma.config.ts` and the seed import this file directly.
 */

/** Any Amazon RDS endpoint (`<id>.<hash>.<region>.rds.amazonaws.com`). */
const PRODUCTION_DATABASE_HOST = /\.rds\.amazonaws\.com$/i;

export function isProductionDatabaseUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    return PRODUCTION_DATABASE_HOST.test(new URL(url.trim()).hostname);
  } catch {
    return false;
  }
}

export class ProductionDatabaseOutsideProductionError extends Error {
  constructor(host: string, purpose: string) {
    super(
      `Refusing to connect ${purpose} to the production database (${host}) with NODE_ENV ` +
        `!== "production". Point DATABASE_URL at your local database, or set ` +
        `NODE_ENV=production if you really mean to act on production.`,
    );
    this.name = "ProductionDatabaseOutsideProductionError";
  }
}

/** Throws when any of `urls` is the production database and this is not production. */
export function assertProductionDatabaseOnlyInProduction(
  urls: ReadonlyArray<string | undefined>,
  nodeEnv: string | undefined,
  purpose: string,
): void {
  if (nodeEnv === "production") return;
  const url = urls.find(isProductionDatabaseUrl);
  if (url)
    throw new ProductionDatabaseOutsideProductionError(new URL(url.trim()).hostname, purpose);
}
