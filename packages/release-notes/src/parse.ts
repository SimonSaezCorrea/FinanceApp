/**
 * Spec 038 — one record of "Novedades" (a feature or fix people can notice), as plain data. A record
 * is a folder `releases/<slug>/` with `es.md` and `en.md`. It carries no date and no version: the
 * version is the deploy that first published it, read from git tags (scripts/versions.mjs).
 *
 *   ---
 *   title: Short title
 *   summary: Optional line.
 *   commits:          (es.md only: the feat/fix commits it covers)
 *     - 5b300ed0
 *   ---
 *
 *   ## Nuevo          (es: Nuevo, Mejoras, Correcciones, Cambios, Seguridad;
 *   - What changed,    en: New, Improvements, Fixes, Changes, Security)
 *     written for people.
 *
 * Inline: **bold**, `code` and [text](https://…). Anything else is an error naming the file, so a
 * broken record stops the public site's build instead of publishing half of it.
 */

export const RELEASE_LANGUAGES = ["es", "en"] as const;
export type ReleaseLanguage = (typeof RELEASE_LANGUAGES)[number];

/** The kinds of change, in the order they are shown. */
export const RELEASE_KINDS = ["new", "improved", "changed", "fixed", "security"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

/** The heading that opens each kind's group, per language. */
export const KIND_HEADINGS: Record<ReleaseLanguage, Record<ReleaseKind, string>> = {
  es: {
    new: "Nuevo",
    improved: "Mejoras",
    fixed: "Correcciones",
    changed: "Cambios",
    security: "Seguridad",
  },
  en: {
    new: "New",
    improved: "Improvements",
    fixed: "Fixes",
    changed: "Changes",
    security: "Security",
  },
};

/** `guias-chile`: a few lower-case words joined by hyphens (the folder's name). */
export const RELEASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export interface ReleaseGroup {
  kind: ReleaseKind;
  /** Each change, as inline tokens. */
  items: InlineToken[][];
}

export interface Release {
  id: string;
  lang: ReleaseLanguage;
  title: string;
  summary: string | null;
  groups: ReleaseGroup[];
  /** The commits it covers (es.md); empty for the other language. */
  commits: string[];
}

export class ReleaseNoteError extends Error {
  constructor(file: string, message: string) {
    super(`Release note "${file}": ${message}`);
    this.name = "ReleaseNoteError";
  }
}

function isLanguage(value: string): value is ReleaseLanguage {
  return (RELEASE_LANGUAGES as readonly string[]).includes(value);
}

export function isReleaseId(value: string): boolean {
  return value.length <= 60 && RELEASE_ID_PATTERN.test(value);
}

/** `…/releases/<id>/<lang>.md` → id and language (any path prefix, either slash). */
export function locate(path: string): { id: string; lang: string; file: string } {
  const parts = path.replace(/\\/g, "/").split("/");
  const name = parts.at(-1) ?? "";
  const id = parts.at(-2) ?? "";
  return { id, lang: name.replace(/\.md$/, ""), file: `${id}/${name}` };
}

function unquote(value: string): string {
  const v = value.trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

interface Frontmatter {
  title?: string;
  summary?: string;
  commits?: string[];
}

const KEYS = new Set(["title", "summary", "commits"]);

function splitFrontmatter(file: string, raw: string): { meta: Frontmatter; body: string } {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new ReleaseNoteError(file, "it must start with a --- frontmatter block");
  const meta: Record<string, string | string[]> = {};
  let list: string | null = null;
  for (const line of match[1]!.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item) {
      if (!list) throw new ReleaseNoteError(file, `a list item outside a list: "${line.trim()}"`);
      (meta[list] as string[]).push(unquote(item[1]!));
      continue;
    }
    const pair = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (!pair) throw new ReleaseNoteError(file, `unreadable frontmatter line: "${line}"`);
    const key = pair[1]!;
    if (!KEYS.has(key)) throw new ReleaseNoteError(file, `unknown frontmatter key "${key}"`);
    if (key in meta) throw new ReleaseNoteError(file, `"${key}" appears twice`);
    if (pair[2]!.trim() === "") {
      meta[key] = [];
      list = key;
    } else {
      meta[key] = unquote(pair[2]!);
      list = null;
    }
  }
  for (const key of ["title", "summary"] as const) {
    if (Array.isArray(meta[key])) throw new ReleaseNoteError(file, `"${key}" must be one line`);
  }
  if (typeof meta.commits === "string") {
    throw new ReleaseNoteError(file, '"commits" must be a list ("  - <hash>" lines)');
  }
  return { meta: meta as Frontmatter, body: text.slice(match[0].length) };
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** One change's text as tokens. Throws on a link that isn't https. */
export function tokenizeInline(text: string, file = "inline"): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) tokens.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: "strong", text: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: "code", text: m[2] });
    else {
      const href = m[4]!;
      if (!/^https:\/\/[^\s]+$/.test(href)) {
        throw new ReleaseNoteError(file, `links must be absolute https addresses: "${href}"`);
      }
      tokens.push({ type: "link", text: m[3]!, href });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
  return tokens;
}

function parseBody(file: string, lang: ReleaseLanguage, body: string): ReleaseGroup[] {
  const byHeading = new Map<string, ReleaseKind>(
    RELEASE_KINDS.map((kind) => [KIND_HEADINGS[lang][kind].toLowerCase(), kind]),
  );
  const groups = new Map<ReleaseKind, string[]>();
  let current: string[] | null = null;
  let inItem = false;
  for (const line of body.split("\n")) {
    if (!line.trim()) {
      inItem = false;
      continue;
    }
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const kind = byHeading.get(heading[1]!.toLowerCase());
      if (!kind) {
        const allowed = RELEASE_KINDS.map((k) => KIND_HEADINGS[lang][k]).join(", ");
        throw new ReleaseNoteError(file, `unknown heading "${heading[1]}" (use: ${allowed})`);
      }
      if (groups.has(kind)) throw new ReleaseNoteError(file, `"${heading[1]}" appears twice`);
      current = [];
      groups.set(kind, current);
      inItem = false;
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      if (!current) throw new ReleaseNoteError(file, "a change before any ## heading");
      current.push(bullet[1]!.trim());
      inItem = true;
      continue;
    }
    if (/^\s+\S/.test(line) && inItem && current) {
      current[current.length - 1] += ` ${line.trim()}`;
      continue;
    }
    throw new ReleaseNoteError(
      file,
      `only "## <kind>" headings and "- " changes: "${line.trim()}"`,
    );
  }
  if (groups.size === 0) throw new ReleaseNoteError(file, "it lists no change");
  return RELEASE_KINDS.filter((kind) => groups.has(kind)).map((kind) => {
    const items = groups.get(kind)!;
    if (items.length === 0) {
      throw new ReleaseNoteError(file, `"${KIND_HEADINGS[lang][kind]}" has no change`);
    }
    return { kind, items: items.map((text) => tokenizeInline(text, file)) };
  });
}

/** One language's file of one record, checked. `path` ends in `<id>/<lang>.md`. */
export function parseRelease(path: string, raw: string): Release {
  const { id, lang, file } = locate(path);
  if (!isReleaseId(id)) {
    throw new ReleaseNoteError(
      file,
      "the folder must be named <words-with-hyphens> (lower case, at most 60 characters)",
    );
  }
  if (!isLanguage(lang)) {
    throw new ReleaseNoteError(file, `the file must be ${RELEASE_LANGUAGES.join(" or ")}.md`);
  }
  const { meta, body } = splitFrontmatter(file, raw);
  const title = meta.title?.trim() ?? "";
  if (!title || title.length > 80) throw new ReleaseNoteError(file, "title: 1 to 80 characters");
  const summary = meta.summary?.trim() || null;
  if (summary && summary.length > 200)
    throw new ReleaseNoteError(file, "summary: at most 200 characters");

  const commits = (meta.commits ?? []).map((c) => c.toLowerCase());
  if (lang === "es") {
    if (commits.length === 0) {
      throw new ReleaseNoteError(file, "commits: list at least one feat/fix commit it covers");
    }
    for (const commit of commits) {
      if (!COMMIT_PATTERN.test(commit)) {
        throw new ReleaseNoteError(
          file,
          `"${commit}" is not a commit hash (7 to 40 hex characters)`,
        );
      }
    }
    if (new Set(commits).size !== commits.length) {
      throw new ReleaseNoteError(file, "commits: a hash is listed twice");
    }
  } else if (meta.commits !== undefined) {
    throw new ReleaseNoteError(file, "commits go in es.md only");
  }

  return {
    id,
    lang,
    title,
    summary,
    groups: parseBody(file, lang, body),
    commits,
  };
}
