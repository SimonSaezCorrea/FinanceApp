import { type CollectionEntry, getCollection } from "astro:content";

import { type Guide, toGuides } from "./guides";

export interface LoadedGuides {
  guides: Guide[];
  /** The collection entry behind a guide, to `render()` its Markdown. */
  entryOf: (guide: Guide) => CollectionEntry<"guides">;
}

/** Every guide of the collection, checked as a set (build time only: reads `astro:content`). */
export async function loadGuides(): Promise<LoadedGuides> {
  const entries = await getCollection("guides");
  const guides = toGuides(entries.map((entry) => ({ id: entry.id, data: entry.data })));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return { guides, entryOf: (guide) => byId.get(guide.id)! };
}
