// Writes the public site's Content-Security-Policy into dist/_headers after `astro build`
// (packages/ui/csp.mjs). The origins come from the same PUBLIC_* variables the build read.
import { fileURLToPath } from "node:url";

import { buildEnv, originOf, writeCsp } from "@finance/ui/csp.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const env = buildEnv(root);
// Cloudflare Web Analytics is added only when its token is set (PageLayout.astro).
const analytics = Boolean(env.PUBLIC_CF_WEB_ANALYTICS_TOKEN);

const { policy, hashes } = writeCsp(fileURLToPath(new URL("../dist", import.meta.url)), {
  "default-src": ["'self'"],
  "script-src": ["'self'", analytics ? "https://static.cloudflareinsights.com" : null],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'", "data:"],
  // The API (sign-in, rates), the app (the "is it up" check before leaving for it) and the
  // analytics beacon.
  "connect-src": [
    "'self'",
    originOf(env.PUBLIC_API_URL),
    originOf(env.PUBLIC_APP_URL),
    analytics ? "https://cloudflareinsights.com" : null,
  ],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
});
console.log(`CSP written (${hashes} inline script hash(es)): ${policy}`);
