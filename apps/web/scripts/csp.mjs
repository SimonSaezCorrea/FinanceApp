// Writes the app's Content-Security-Policy into dist/_headers after `vite build`
// (packages/ui/csp.mjs). The origins come from the same VITE_* variables the build read.
import { fileURLToPath } from "node:url";

import { buildEnv, originOf, writeCsp } from "@finance/ui/csp.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const env = buildEnv(root);

const { policy, hashes } = writeCsp(fileURLToPath(new URL("../dist", import.meta.url)), {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  // The API, and Sentry's ingest host when error reporting is on (the DSN's origin).
  "connect-src": ["'self'", originOf(env.VITE_API_URL), originOf(env.VITE_SENTRY_DSN)],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
});
console.log(`CSP written (${hashes} inline script hash(es)): ${policy}`);
