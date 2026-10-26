#!/usr/bin/env node
// Spec 038 — "todo queda registrado": every feat/fix commit that reaches main must be listed in a
// release record (`releases/<id>/es.md`, frontmatter `commits:`). Run by .husky/pre-push when a
// ref goes to main and by CI on main, before Deploy.
//
//   node packages/release-notes/scripts/check.mjs [--range origin/main..HEAD] [--ref <sha>] [--pending]
//
// --ref reads the records from that commit instead of the working tree (what the hook pushes).
//
// Exit 0: covered. Exit 1: uncovered commits, each named. Exit 2: usage, git or unreadable record.
// Plain Node, no dependencies: it runs before `pnpm install` in CI.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "releases");

/** feat/fix, with or without a scope, with or without `!`: a change people can notice. */
const USER_FACING = /^(feat|fix)(\([^)]*\))?!?:/;

/** @param {string} subject */
export function isUserFacing(subject) {
  return USER_FACING.test(subject.trim());
}

/** The hashes in one record's es.md text, lower case. @param {string} raw @returns {string[]} */
export function hashesIn(raw) {
  const text = raw.replace(/\r\n?/g, "\n");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const block = /^commits:[ \t]*\n((?:[ \t]+-[^\n]*\n?)*)/m.exec(frontmatter)?.[1] ?? "";
  const hashes = [];
  for (const line of block.split("\n")) {
    const hash = /^\s+-\s+["']?([0-9a-fA-F]{7,40})["']?\s*$/.exec(line)?.[1];
    if (hash) hashes.push(hash.toLowerCase());
  }
  return hashes;
}

/** The hashes listed by every record in a folder (`commits:` in each es.md).
 * @param {string} root @returns {string[]} */
export function readCovered(root = DEFAULT_ROOT) {
  if (!existsSync(root)) return [];
  const covered = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = join(root, dir.name, "es.md");
    if (existsSync(file)) covered.push(...hashesIn(readFileSync(file, "utf8")));
  }
  return covered;
}

const RECORDS_PATH = "packages/release-notes/releases";

/** The same, read from a commit instead of the working tree: the pre-push hook checks what is
 * being pushed, whatever is checked out. @param {string} ref @param {string} [cwd] */
export function readCoveredAt(ref, cwd) {
  /** @param {string[]} args */
  const git = (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return git(["ls-tree", "-r", "--name-only", ref, "--", RECORDS_PATH])
    .split("\n")
    .filter((file) => /\/[^/]+\/es\.md$/.test(file))
    .flatMap((file) => hashesIn(git(["show", `${ref}:${file}`])));
}

/** @typedef {{ hash: string, subject: string }} Commit */

/** The feat/fix commits not covered by any listed hash (a listed hash may be abbreviated).
 * @param {Commit[]} commits @param {string[]} covered @returns {Commit[]} */
export function uncovered(commits, covered) {
  return commits.filter(
    (c) => isUserFacing(c.subject) && !covered.some((h) => c.hash.toLowerCase().startsWith(h)),
  );
}

/** Non-merge commits of a git range, oldest first. @param {string} range @param {string} [cwd]
 * @returns {Commit[]} */
export function commitsIn(range, cwd) {
  const out = execFileSync("git", ["log", "--no-merges", "--reverse", "--format=%H%x1f%s", range], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash = "", subject = ""] = line.split("\x1f");
      return { hash, subject };
    });
}

/** @param {Commit[]} missing @param {string} range */
export function formatReport(missing, range) {
  return [
    `✖ Novedades: ${missing.length} commit(s) feat/fix de ${range} no están en ningún registro:`,
    ...missing.map((c) => `    ${c.hash.slice(0, 8)}  ${c.subject}`),
    "",
    "  Escribe el registro de este despliegue (spec 038):",
    "    1. pnpm release-notes:pending   (imprime el bloque commits: listo para pegar)",
    "    2. crea packages/release-notes/releases/<YYYY-MM-DD>-<slug>/es.md y en.md",
    "    3. commit `docs(release): …` y vuelve a empujar",
  ].join("\n");
}

/** @param {Commit[]} missing */
export function formatPending(missing) {
  if (missing.length === 0) return "Nada pendiente: todos los feat/fix están registrados.";
  return [
    "commits:",
    ...missing.map((c) => `  - ${c.hash.slice(0, 8)}`),
    "",
    "# Lo que traen:",
    ...missing.map((c) => `#   ${c.hash.slice(0, 8)}  ${c.subject}`),
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    range: "origin/main..HEAD",
    pending: false,
    root: DEFAULT_ROOT,
    ref: "",
    cwd: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pending") args.pending = true;
    else if (arg === "--range") args.range = argv[++i] ?? "";
    else if (arg === "--root") args.root = resolve(argv[++i] ?? "");
    else if (arg === "--ref") args.ref = argv[++i] ?? "";
    else if (arg === "--cwd") args.cwd = resolve(argv[++i] ?? "");
    else throw new Error(`argumento desconocido: ${arg}`);
  }
  if (!args.range) throw new Error("--range necesita un rango, p. ej. origin/main..HEAD");
  return args;
}

/** @param {string[]} argv @returns {number} exit code */
export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`✖ ${error.message}`);
    return 2;
  }
  let commits;
  let covered;
  try {
    commits = commitsIn(args.range, args.cwd);
    covered = args.ref ? readCoveredAt(args.ref, args.cwd) : readCovered(args.root);
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim();
    console.error(`✖ No se pudo leer ${args.range}${args.ref ? ` (${args.ref})` : ""}: ${detail}`);
    return 2;
  }
  const missing = uncovered(commits, covered);
  if (args.pending) {
    console.log(formatPending(missing));
    return 0;
  }
  if (missing.length > 0) {
    console.error(formatReport(missing, args.range));
    return 1;
  }
  const count = commits.filter((c) => isUserFacing(c.subject)).length;
  console.log(`✓ Novedades: ${count} commit(s) feat/fix de ${args.range}, todos registrados.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
