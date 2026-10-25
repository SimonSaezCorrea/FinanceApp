import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Spec 035 — the sitemap's language pairs for the guides, read straight from the content folder
 * (astro.config runs before Astro's content layer exists). Each guide folder with an `es.md` AND an
 * `en.md` gives one pair of addresses, built from the `address:` line of each file's frontmatter; a
 * guide in one language gives none. Section slugs: the same as LOCALIZED_SLUGS.guides.
 */
const SECTION = { es: "guias", en: "guides" };

function addressOf(file) {
  const text = readFileSync(file, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  return /^address:\s*["']?([a-z0-9-]+)["']?\s*$/m.exec(frontmatter)?.[1] ?? null;
}

/** @param {string} root The guides content folder. @returns {{ es: string, en: string }[]} */
export function guideSitemapPairs(root) {
  if (!existsSync(root)) return [];
  const pairs = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const es = join(root, dir.name, "es.md");
    const en = join(root, dir.name, "en.md");
    if (!existsSync(es) || !existsSync(en)) continue;
    const esAddress = addressOf(es);
    const enAddress = addressOf(en);
    if (!esAddress || !enAddress) continue;
    pairs.push({ es: `/es/${SECTION.es}/${esAddress}/`, en: `/en/${SECTION.en}/${enAddress}/` });
  }
  return pairs;
}
