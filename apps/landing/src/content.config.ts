import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Spec 035 — the guides: one folder per guide, one Markdown file per language
 * (`src/content/guides/<guide>/es.md`, `en.md`). Publishing a guide is adding its files; every field
 * below is checked when the site is built, and a missing or invalid one stops the build naming the
 * file (FR-014, FR-015). Rules that need the whole set live in `domains/guides/lib/guides.ts`.
 */
const guides = defineCollection({
  loader: glob({ pattern: "*/{es,en}.md", base: "./src/content/guides" }),
  schema: z.object({
    /** The question the guide answers: its h1 and <title>. */
    title: z.string().trim().min(1),
    /** A few words for lists where the full question is too long (the footer). */
    shortTitle: z.string().trim().min(1).max(32),
    /** Meta description and the index's summary line. */
    description: z.string().trim().min(1).max(160),
    /** The address in the page's language: /es/guias/<address>/, /en/guides/<address>/. (Not `slug`,
     * which Astro's loader reserves as the entry id.) */
    address: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words joined by hyphens"),
    publishedAt: z.coerce.date(),
    /** The day every source was last checked. */
    reviewedAt: z.coerce.date(),
    sources: z
      .array(
        z.object({
          /** The institution: CMF, SERNAC, Banco Central de Chile, SII… */
          name: z.string().trim().min(1),
          title: z.string().trim().min(1),
          url: z.url({ protocol: /^https$/ }),
        }),
      )
      .min(1),
  }),
});

export const collections = { guides };
