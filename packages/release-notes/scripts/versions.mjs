#!/usr/bin/env node
// Novedades: which version brought each release record, read from git. The deploy (deploy.yml)
// tags the commit it published `v1.N` when it ends well, with the day in the tag's subject
// ("fik v1.2 · 2026-11-02"); a record belongs to the first tag whose tree has it. Records in no
// tag yet are the version being deployed now: the next number, dated today in Chile (or
// RELEASE_DATE). Nobody writes a version or a date by hand.
//
//   node packages/release-notes/scripts/versions.mjs              JSON of every version
//   node packages/release-notes/scripts/versions.mjs --next-tag   the version to tag, if any
//
// Builds read it through the Vite plugin (vite-plugin.mjs). They need the tags: a checkout with
// `fetch-depth: 0`. Without git (or in a shallow clone) every record counts as the next version.
// RELEASE_VERSIONS_SNAPSHOT=<file.json> replaces git with a fixed list (tests of the built site).
// Plain Node, no dependencies.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chileDay, compareVersions, nextVersion, parseVersion } from "./version-rules.mjs";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "releases");
const RECORDS_PATH = "packages/release-notes/releases";

/** @typedef {{ version: string, date: string, pending: boolean, records: string[] }} Version */
/** @typedef {{ version: string, date: string }} Tag */

/** The record folders on disk (each with its es.md). @param {string} root @returns {string[]} */
export function recordIdsIn(root = DEFAULT_ROOT) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "es.md")))
    .map((d) => d.name);
}

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** The version tags, oldest first, each with its day: the one in its subject, else the day it
 * was created in Chile. @param {string} cwd @returns {Tag[]} */
export function readTags(cwd) {
  const out = git(
    [
      "for-each-ref",
      "refs/tags",
      "--format=%(refname:short)%1f%(creatordate:iso-strict)%1f%(contents:subject)",
    ],
    cwd,
  );
  /** @type {Tag[]} */
  const tags = [];
  for (const line of out.split("\n")) {
    const [name = "", created = "", subject = ""] = line.split("\x1f");
    if (!/^v\d+\.\d+$/.test(name)) continue;
    const day = /\d{4}-\d{2}-\d{2}/.exec(subject)?.[0] ?? chileDay(new Date(created));
    tags.push({ version: name.slice(1), date: day });
  }
  return tags.sort((a, b) => compareVersions(a.version, b.version));
}

/** The record folders in a commit's tree. @param {string} ref @param {string} cwd */
export function recordIdsAt(ref, cwd) {
  try {
    return git(["ls-tree", "--full-tree", "-d", "--name-only", `${ref}:${RECORDS_PATH}`], cwd)
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // the folder didn't exist yet
  }
}

/** When each record folder first appeared (seconds), to show the newest first inside a version.
 * @param {string} cwd @returns {Map<string, number>} */
export function addedAt(cwd) {
  const out = git(
    [
      "log",
      "--no-renames",
      "--diff-filter=A",
      "--format=%x1e%ct",
      "--name-only",
      "--",
      `:(top)${RECORDS_PATH}`,
    ],
    cwd,
  );
  /** @type {Map<string, number>} */
  const added = new Map();
  for (const block of out.split("\x1e")) {
    const [time, ...files] = block.trim().split("\n");
    for (const file of files) {
      const id = file.slice(RECORDS_PATH.length + 1).split("/")[0];
      // git log goes newest first: the last time seen is the first addition.
      if (id) added.set(id, Number(time));
    }
  }
  return added;
}

/**
 * Groups records into versions, newest first. Pure.
 * @param {{ current: string[], tags: Tag[], recordsAtTag: (version: string) => string[],
 *   today: string, addedAt?: Map<string, number> }} input
 * @returns {Version[]}
 */
export function assignVersions({ current, tags, recordsAtTag, today, addedAt: added }) {
  const present = new Set(current);
  const seen = new Set();
  /** @param {string[]} ids */
  const ordered = (ids) =>
    [...ids].sort((a, b) => {
      const ta = added?.get(a) ?? Infinity;
      const tb = added?.get(b) ?? Infinity;
      return ta === tb ? a.localeCompare(b) : tb - ta;
    });
  /** @type {Version[]} */
  const versions = [];
  for (const tag of tags) {
    const fresh = recordsAtTag(tag.version).filter((id) => !seen.has(id));
    fresh.forEach((id) => seen.add(id));
    const records = fresh.filter((id) => present.has(id));
    if (records.length > 0) {
      versions.push({
        version: tag.version,
        date: tag.date,
        pending: false,
        records: ordered(records),
      });
    }
  }
  const pending = current.filter((id) => !seen.has(id));
  if (pending.length > 0) {
    versions.push({
      version: nextVersion(tags.at(-1)?.version),
      date: today,
      pending: true,
      records: ordered(pending),
    });
  }
  return versions.reverse();
}

/** Every version of the records in `root`, newest first, read from git.
 * @param {{ root?: string, today?: string, warn?: (message: string) => void }} [options]
 * @returns {Version[]} */
export function resolveVersions(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const today = options.today || process.env.RELEASE_DATE || chileDay();
  const warn = options.warn ?? ((message) => console.warn(message));
  const current = recordIdsIn(root);
  const snapshot = process.env.RELEASE_VERSIONS_SNAPSHOT;
  if (snapshot) {
    /** @type {Version[]} */
    const fixed = JSON.parse(readFileSync(resolve(snapshot), "utf8"));
    return fixed
      .map((v) => ({ ...v, records: v.records.filter((id) => current.includes(id)) }))
      .filter((v) => v.records.length > 0);
  }
  try {
    if (git(["rev-parse", "--is-shallow-repository"], root).trim() === "true") {
      warn("release-notes: shallow clone, so no version tags: every record counts as new.");
    }
    const tags = readTags(root);
    return assignVersions({
      current,
      tags,
      recordsAtTag: (version) => recordIdsAt(`v${version}`, root),
      today,
      addedAt: addedAt(root),
    });
  } catch (error) {
    warn(
      `release-notes: git unavailable (${String(error).split("\n")[0]}): every record counts as new.`,
    );
    return assignVersions({ current, tags: [], recordsAtTag: () => [], today });
  }
}

/** The version to tag after a deploy of the checked-out commit, or null when it brought no new
 * record. @param {{ root?: string }} [options] */
export function versionToTag(options = {}) {
  const latest = resolveVersions({ ...options, warn: () => {} })[0];
  return latest?.pending ? latest.version : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--next-tag")) {
    const version = versionToTag();
    if (version && !parseVersion(version)) process.exit(2);
    if (version) console.log(version);
  } else {
    console.log(JSON.stringify(resolveVersions(), null, 2));
  }
}
