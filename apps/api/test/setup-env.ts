import { resolve } from "node:path";

import { config } from "dotenv";

/**
 * Vitest doesn't boot the Nest `ConfigModule`, so integration/e2e tests that
 * construct `PrismaService` directly (via `new ConfigService()`) would find no
 * `DATABASE_URL` at all. Load `apps/api/.env` here so every suite sees the same
 * env the app does; `TEST_DATABASE_URL`, when set, wins so integration tests can
 * point at a throwaway database instead of the dev one.
 *
 * Harmless for `test:unit` — it opens no connection either way (SC-002).
 */
// Vitest's `root` is `apps/api`, so cwd-relative is the same file the app reads.
config({ path: resolve(process.cwd(), ".env"), quiet: true });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
