// Content-Security-Policy for a built static site (the app and the public site, both on Cloudflare
// Pages). Run after the build: it hashes every inline script the HTML of `dist/` carries and
// writes the policy into `dist/_headers`, replacing the baseline line the source `_headers` has.
//
// Why hashes and not 'unsafe-inline': the pre-paint theme script (and, on the public site, the
// redirect pages) are the only inline JavaScript; allowing exactly those means an injected
// <script> never runs. Styles keep 'unsafe-inline': the illustrations are drawn with style=
// attributes and some libraries add <style> tags, and a style can't run code.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Script types the browser executes; JSON-LD and JSON islands are data and need no hash. */
const EXECUTABLE = new Set(["", "text/javascript", "application/javascript", "module"]);

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith(".html") ? [path] : [];
  });
}

/**
 * The build's environment as the bundler saw it: `.env`, `.env.production` (later wins), then the
 * process environment on top — what CI sets. Only KEY=value lines; quotes around a value dropped.
 */
export function buildEnv(appRoot) {
  const env = {};
  for (const name of [".env", ".env.production"]) {
    const path = join(appRoot, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return { ...env, ...process.env };
}

/** `'sha256-…'` for every distinct inline executable script in `html`. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? "").toLowerCase();
    if (!EXECUTABLE.has(type)) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return hashes;
}

/** Origin (scheme://host[:port]) of a URL, or null when it's empty or not a URL. */
export function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The policy, one directive per entry: `{ "script-src": ["'self'", …], … }`. */
export function serializePolicy(directives) {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...[...new Set(sources.filter(Boolean))]].join(" "))
    .join("; ");
}

/**
 * Writes the policy into `<distDir>/_headers`. `directives` gets every inline script's hash added
 * to its `script-src`. The source `_headers` MUST carry exactly one `Content-Security-Policy:`
 * line (the baseline); a build without it fails rather than shipping no policy.
 */
export function writeCsp(distDir, directives) {
  const hashes = new Set();
  for (const file of htmlFiles(distDir)) {
    for (const hash of inlineScriptHashes(readFileSync(file, "utf8"))) hashes.add(hash);
  }
  const policy = serializePolicy({
    ...directives,
    "script-src": [...(directives["script-src"] ?? ["'self'"]), ...[...hashes].sort()],
  });

  const headersPath = join(distDir, "_headers");
  const lines = readFileSync(headersPath, "utf8").split("\n");
  const at = lines.flatMap((line, i) => (/^\s+Content-Security-Policy:/.test(line) ? [i] : []));
  if (at.length !== 1) {
    throw new Error(
      `${headersPath}: expected one Content-Security-Policy line, found ${at.length}`,
    );
  }
  const indent = /^\s*/.exec(lines[at[0]])[0];
  lines[at[0]] = `${indent}Content-Security-Policy: ${policy}`;
  writeFileSync(headersPath, lines.join("\n"));
  return { policy, hashes: hashes.size };
}
