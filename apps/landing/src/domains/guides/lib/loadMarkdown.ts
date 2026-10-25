import { t } from "../../../i18n";
import { formatDay } from "../../rates/lib/chileDay";
import { isoDay } from "./dates";
import type { Guide } from "./guides";
import type { LoadedGuides } from "./load";
import { guideMarkdown } from "./markdown";

/** The Markdown of one guide with its labels in the guide's language (build time only). */
export function markdownOf(
  guide: Guide,
  entryOf: LoadedGuides["entryOf"],
  site: URL | undefined,
): string {
  const origin = (site?.toString() ?? "http://localhost:4321/").replace(/\/+$/, "");
  const lang = guide.lang;
  return guideMarkdown(guide, entryOf(guide).body ?? "", `${origin}${guide.path}`, {
    published: t(lang, "landing.guides.published", {
      date: formatDay(isoDay(guide.publishedAt), lang),
    }),
    reviewed: t(lang, "landing.guides.reviewed", {
      date: formatDay(isoDay(guide.reviewedAt), lang),
    }),
    authorRole: t(lang, "landing.guides.authorRole"),
    sources: t(lang, "landing.guides.sources"),
    notice: t(lang, "landing.guides.notice"),
  });
}
