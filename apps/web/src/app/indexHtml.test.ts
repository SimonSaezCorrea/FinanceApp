import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** The app is not for search engines (spec 031, FR-019): the public site is what gets indexed and
 * shared, so the app's page tells crawlers to stay out and carries no social preview. */
describe("index.html", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf-8");

  it("asks search engines not to index or follow it", () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it("carries no Open Graph or description", () => {
    expect(html).not.toMatch(/property="og:/);
    expect(html).not.toMatch(/name="description"/);
  });
});
