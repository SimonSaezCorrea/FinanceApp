#!/usr/bin/env node
/**
 * Reset the FinanceApp database to a clean, freshly-seeded state — Docker-based.
 *
 *   pnpm db:reset
 *
 * Steps:
 *   1. Tear down the Postgres container AND its volume (all data is destroyed).
 *   2. Start a fresh Postgres container (docker-compose.yml).
 *   3. Wait until it is healthy.
 *   4. Push the Prisma schema (creates every table from scratch).
 *   5. Run the seed.
 *
 * Nothing is in production, so wiping the volume is intentional and safe.
 * Requires Docker (Desktop/Engine) running. Credentials live in docker-compose.yml
 * and must match apps/api/.env (postgres/simon789 @ localhost:5432/financeApp).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
};
const capture = (cmd) => execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
/** Like run(), but never aborts — for idempotent teardown that may have nothing to remove. */
const runSafe = (cmd) => {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { cwd: root, stdio: "inherit" });
  } catch {
    console.warn(`  (ignored — nothing to remove or already down)`);
  }
};

function waitForHealthy(container, timeoutMs = 90_000) {
  const start = Date.now();
  process.stdout.write("Waiting for Postgres to be healthy");
  for (;;) {
    let status = "";
    try {
      status = capture(`docker inspect -f "{{.State.Health.Status}}" ${container}`);
    } catch {
      status = "starting";
    }
    if (status === "healthy") {
      console.log(" ✓");
      return;
    }
    if (Date.now() - start > timeoutMs) {
      console.error(`\nTimed out waiting for ${container} to become healthy (last: ${status}).`);
      process.exit(1);
    }
    process.stdout.write(".");
    execSync(process.platform === "win32" ? "ping -n 3 127.0.0.1 > NUL" : "sleep 2", { stdio: "ignore" });
  }
}

console.log("⟲ Resetting FinanceApp database from scratch (Docker)…");

// 0: fail fast with a clear message if Docker isn't available/running.
try {
  capture("docker info");
} catch {
  console.error("\n✗ Docker no está disponible o el daemon no está corriendo. Inicia Docker y reintenta.");
  process.exit(1);
}

// 1 + 2: destroy volume and recreate the container. Teardown is best-effort:
// if there's no container/volume yet, we just continue.
runSafe("docker compose down -v --remove-orphans");
run("docker compose up -d db");

// 3: wait until Postgres accepts connections.
waitForHealthy("financeapp-db");

// 4: create the schema fresh (no migrations folder in this repo — db push is the workflow).
run("pnpm --filter @finance/api exec prisma db push --skip-generate");

// 5: seed demo data.
run("pnpm db:seed");

console.log("\n✅ Database reset complete. Demo login: test@finance.local / demo1234");
