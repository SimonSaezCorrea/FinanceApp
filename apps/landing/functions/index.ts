/**
 * Cloudflare Pages Function for `/` only (a file named `index` maps to the root, and nothing
 * else runs through a Function): the language redirect a static `_redirects` can't express.
 * The rule lives in `src/lib/rootRedirect.ts`, where it is tested; `dist/index.html` stays as
 * the fallback where no Function runs (`astro preview`).
 */
import { rootRedirect } from "../src/lib/rootRedirect";

export const onRequest = ({ request }: { request: Request }): Response => rootRedirect(request);
