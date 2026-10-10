import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import es from "@finance/i18n/src/es.json";

// Vitest runs from `apps/web` (jsdom rewrites `import.meta.url`, so it can't anchor the paths).
const SRC = resolve(process.cwd(), "src");
const UI_SRC = resolve(process.cwd(), "../../packages/ui/src");

/** Every `.ts`/`.tsx` source file under `dir`, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function has(key: string): boolean {
  let node: unknown = es;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

/** A key passed with `count` resolves to its `_one`/`_other` forms. */
const resolves = (key: string) => has(key) || has(`${key}_one`) || has(`${key}_other`);

/**
 * Every literal key the app passes to `t("…")` must exist in the catalog. The parity test only
 * compares es with en, so a key used in code but added to neither shipped as raw text on screen
 * (the step-up panel showed `profile.security.stepUp.title`). Keys built at runtime
 * (`errors.${code}`) aren't literals and are out of reach here.
 */
describe("i18n keys used by the app", () => {
  it("every literal t() key exists in the catalog", () => {
    const missing: string[] = [];
    for (const file of [...sources(SRC), ...sources(UI_SRC)]) {
      const text = readFileSync(file, "utf-8");
      for (const [, key] of text.matchAll(/\bt\(\s*["']([\w]+(?:\.[\w]+)+)["']/g)) {
        if (key && !resolves(key)) missing.push(`${key} (${relative(SRC, file)})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
