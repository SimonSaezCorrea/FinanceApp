import { pagePath, pickLanguage } from "./language";

/** "es-CL,es;q=0.9,en;q=0.8" → ["es-cl", "es", "en"], by the weight each language carries (a
 * missing `q` is 1; ties keep the header's order, which is the browser's own preference). */
export function acceptedLanguages(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((l) => l.tag && l.tag !== "*" && l.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((l) => l.tag);
}

/**
 * The root of the site has no page of its own: a 302 to the home in the visitor's language
 * (`/es/` or `/en/`), keeping the query (`?acceso=login&volver=…`; the `#hash` never reaches the
 * server and the browser carries it over). 302, never 301: the answer depends on who asks, which
 * is also why it varies on `Accept-Language` and is never cached by a shared cache.
 */
export function rootRedirect(request: Request): Response {
  const url = new URL(request.url);
  const lang = pickLanguage(acceptedLanguages(request.headers.get("Accept-Language")));
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${pagePath(lang, "home")}${url.search}`,
      Vary: "Accept-Language",
      "Cache-Control": "private, no-cache",
    },
  });
}
