import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inlineScriptHashes, originOf, serializePolicy, writeCsp } from "../csp.mjs";

describe("CSP for a built static site", () => {
  it("hashes inline executable scripts, never external ones or data blocks", () => {
    const html = `
      <script>console.log(1)</script>
      <script type="module">import "./a.js"</script>
      <script src="/x.js"></script>
      <script type="application/ld+json">{"@type":"WebSite"}</script>
      <script type="application/json" id="rates-data">{}</script>`;
    const hashes = [...inlineScriptHashes(html)];
    expect(hashes).toHaveLength(2);
    // sha256 of "console.log(1)", base64.
    expect(hashes).toContain("'sha256-CihokcEcBW4atb/CW/XWsvWwbTjqwQlE9nj9ii5ww5M='");
  });

  it("takes the origin of a URL and nothing of an empty or broken one", () => {
    expect(originOf("https://api.mifik.cl/api/v1")).toBe("https://api.mifik.cl");
    expect(originOf("")).toBeNull();
    expect(originOf(undefined)).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });

  it("drops empty sources and repeats", () => {
    expect(serializePolicy({ "a-src": ["'self'", null, "'self'"], "b-src": ["'none'"] })).toBe(
      "a-src 'self'; b-src 'none'",
    );
  });

  it("replaces the baseline line of dist/_headers with the policy and the scripts' hashes", () => {
    const dist = mkdtempSync(join(tmpdir(), "csp-"));
    writeFileSync(join(dist, "index.html"), "<script>console.log(1)</script>");
    writeFileSync(
      join(dist, "_headers"),
      "/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: object-src 'none'\n",
    );
    writeCsp(dist, { "default-src": ["'self'"], "script-src": ["'self'"] });
    expect(readFileSync(join(dist, "_headers"), "utf8")).toBe(
      "/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; " +
        "script-src 'self' 'sha256-CihokcEcBW4atb/CW/XWsvWwbTjqwQlE9nj9ii5ww5M='\n",
    );
  });

  it("refuses a _headers without exactly one CSP line rather than ship none", () => {
    const dist = mkdtempSync(join(tmpdir(), "csp-"));
    writeFileSync(join(dist, "_headers"), "/*\n  X-Frame-Options: DENY\n");
    expect(() => writeCsp(dist, {})).toThrow(/expected one Content-Security-Policy line/);
  });
});
