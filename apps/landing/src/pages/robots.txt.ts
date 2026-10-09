import type { APIRoute } from "astro";

/** Let crawlers in and point them at the sitemap (FR-005). Generated so it names this site's own
 * origin (`site` in astro.config.mjs, from PUBLIC_SITE_URL). */
export const GET: APIRoute = ({ site }) => {
  const origin = (site?.toString() ?? "http://localhost:4321/").replace(/\/+$/, "");
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap-index.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
