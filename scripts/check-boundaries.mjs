#!/usr/bin/env node
// Enforces the architecture boundaries (Constitution + spec FR-003/006/011, SC-004/007):
//   - apps/web must NOT import the backend (@finance/api / apps/api) or any DB client.
//   - apps/api must NOT import the frontend (@finance/web / apps/web).
//   - packages/* must NOT import any app (@finance/* app or apps/*).
// Shared code is consumed only via @finance/contracts, @finance/money, @finance/config.
//
// No external deps: walks the tree and inspects import/require/from specifiers.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);

const RULES = [
  {
    name: "web ↛ backend / DB",
    root: "apps/web/src",
    forbidden: [
      /@finance\/api/,
      /apps\/api/,
      /["']@prisma\/client["']/,
      /["']\.?\.?\/?prisma["']/,
      /from ["']@finance\/api/,
    ],
  },
  {
    name: "api ↛ frontend",
    root: "apps/api/src",
    forbidden: [/@finance\/web/, /apps\/web/],
  },
  {
    name: "packages ↛ apps",
    root: "packages",
    forbidden: [/@finance\/(api|web)/, /apps\//],
  },
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      if (e === "node_modules" || e === "dist") continue;
      out.push(...walk(full));
    } else if (SRC_EXT.has(full.slice(full.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_RE =
  /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g;

const violations = [];
for (const rule of RULES) {
  for (const file of walk(join(ROOT, rule.root))) {
    const text = readFileSync(file, "utf8");
    let m;
    while ((m = IMPORT_RE.exec(text)) !== null) {
      const spec = m[1] ?? m[2] ?? "";
      if (rule.forbidden.some((re) => re.test(`"${spec}"`) || re.test(spec))) {
        violations.push(`  [${rule.name}] ${relative(ROOT, file)} → "${spec}"`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("✗ Architecture boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("✓ Architecture boundaries OK (web↛api/db, api↛web, packages↛apps)");
