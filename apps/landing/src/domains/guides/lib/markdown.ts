import type { Guide } from "./guides";

export interface GuideMarkdownLabels {
  /** "Publicada el 23 de octubre de 2026" — already formatted in the guide's language. */
  published: string;
  reviewed: string;
  sources: string;
  notice: string;
}

/**
 * A guide as one Markdown document for language models ("Recursos para IA"): title, summary,
 * address and dates, the body exactly as written, its sources and the general-information notice.
 * Served at `<guide>.md` and copied by "Copiar página para LLMs", so both are the same text.
 */
export function guideMarkdown(
  guide: Pick<Guide, "title" | "description" | "author" | "sources">,
  body: string,
  url: string,
  labels: GuideMarkdownLabels,
): string {
  return (
    [
      `# ${guide.title}`,
      `> ${guide.description}`,
      [`- URL: ${url}`, `- ${labels.published}`, `- ${labels.reviewed}`, `- ${guide.author}`].join(
        "\n",
      ),
      body.trim(),
      [
        `## ${labels.sources}`,
        ...guide.sources.map((s) => `- [${s.name}: ${s.title}](${s.url})`),
      ].join("\n"),
      `_${labels.notice}_`,
    ].join("\n\n") + "\n"
  );
}
