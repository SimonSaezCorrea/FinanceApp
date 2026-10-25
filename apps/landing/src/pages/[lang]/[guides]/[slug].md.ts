import type { APIRoute } from "astro";

import { markdownOf } from "../../../domains/guides/lib/loadMarkdown";
import { loadGuides } from "../../../domains/guides/lib/load";
import { LOCALIZED_SLUGS } from "../../../lib/language";

/** A guide as Markdown ("Mostrar como Markdown"): `/es/guias/<slug>.md`, next to its page. */
export async function getStaticPaths() {
  const { guides } = await loadGuides();
  return guides.map((guide) => ({
    params: { lang: guide.lang, guides: LOCALIZED_SLUGS.guides[guide.lang], slug: guide.address },
    props: { key: guide.id },
  }));
}

export const GET: APIRoute = async ({ props, site }) => {
  const { guides, entryOf } = await loadGuides();
  const guide = guides.find((g) => g.id === props.key)!;
  return new Response(markdownOf(guide, entryOf, site), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
