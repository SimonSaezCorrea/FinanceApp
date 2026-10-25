import { LANGUAGES, type Language, pagePath } from "../../../lib/language";

/**
 * Spec 035 — the guides section, as plain data. A guide is a folder under `src/content/guides/`
 * with one Markdown file per language (`<key>/es.md`, `<key>/en.md`): the folder name pairs the
 * languages and never reaches an address. Astro validates each file's frontmatter against the
 * collection schema (`src/content.config.ts`); the rules that need the whole set — one address per
 * language, a review not dated before the publication, only known languages — live here, and break
 * the build naming the file (FR-015).
 */

/** Every guide is signed by its writer, presented on the About page (`#author`). The role
 * is `landing.guides.authorRole`, in the guide's language. */
export const AUTHOR = "Simón Sáez";

export interface GuideSource {
  name: string;
  title: string;
  url: string;
}

export interface GuideData {
  title: string;
  shortTitle: string;
  description: string;
  address: string;
  publishedAt: Date;
  reviewedAt: Date;
  sources: GuideSource[];
}

/** What the collection hands over: the entry id is `<key>/<lang>` (its path without `.md`). */
export interface GuideEntry {
  id: string;
  data: GuideData;
}

export interface Guide extends GuideData {
  /** The entry id, for messages and rendering. */
  id: string;
  key: string;
  lang: Language;
  path: string;
  author: string;
}

export function guidePath(lang: Language, address: string): string {
  return `${pagePath(lang, "guides")}${address}/`;
}

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** The collection's entries as guides, checked as a set. Throws on the first problem. */
export function toGuides(entries: readonly GuideEntry[]): Guide[] {
  const guides = entries.map((entry): Guide => {
    const [key = "", lang = ""] = entry.id.split("/");
    if (!key || !isLanguage(lang)) {
      throw new Error(
        `Guide "${entry.id}": the file must be src/content/guides/<guide>/<${LANGUAGES.join("|")}>.md`,
      );
    }
    if (entry.data.reviewedAt.getTime() < entry.data.publishedAt.getTime()) {
      throw new Error(`Guide "${entry.id}": reviewedAt is before publishedAt`);
    }
    return {
      ...entry.data,
      id: entry.id,
      key,
      lang,
      path: guidePath(lang, entry.data.address),
      author: AUTHOR,
    };
  });

  const byPath = new Map<string, Guide>();
  for (const guide of guides) {
    const taken = byPath.get(guide.path);
    if (taken) {
      throw new Error(
        `Guides "${taken.id}" and "${guide.id}" both use the address ${guide.path}: change one address`,
      );
    }
    byPath.set(guide.path, guide);
  }
  return guides;
}

/** The same guide in the other language, or null when it was written in one language only. */
export function pairOf(guide: Guide, guides: readonly Guide[]): Guide | null {
  return guides.find((g) => g.key === guide.key && g.lang !== guide.lang) ?? null;
}

/** The index of one language: newest review first, then by title (FR-012). */
export function sortForIndex(guides: readonly Guide[], lang: Language): Guide[] {
  return guides
    .filter((g) => g.lang === lang)
    .sort(
      (a, b) =>
        b.reviewedAt.getTime() - a.reviewedAt.getTime() || a.title.localeCompare(b.title, lang),
    );
}

/** The canonical path of each language the guide exists in (for the layout's hreflang). */
export function pathsOf(guide: Guide, guides: readonly Guide[]): Partial<Record<Language, string>> {
  const pair = pairOf(guide, guides);
  return pair ? { [guide.lang]: guide.path, [pair.lang]: pair.path } : { [guide.lang]: guide.path };
}
