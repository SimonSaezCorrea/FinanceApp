import type { APIRoute } from "astro";

import { buildLlmsText } from "../domains/llms/lib/build";

/** `/llms.txt` (llmstxt.org): the site described for language models, rebuilt with every build so
 * today's UF and dollar are in it. People see the same text at `/<lang>/ai/`. */
export const GET: APIRoute = async ({ site }) =>
  new Response(await buildLlmsText(site), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
