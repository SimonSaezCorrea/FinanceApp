import { describe, expect, it } from "vitest";

import { changeHtml } from "./render";

describe("changeHtml", () => {
  it("escapes every piece and italicizes the brand", () => {
    expect(
      changeHtml([
        { type: "text", text: "En mifik <b>" },
        { type: "strong", text: "nuevo" },
        { type: "code", text: "/llms.txt?a=1&b" },
        { type: "link", text: "guías", href: "https://mifik.cl/es/guias/?a=1&b=2" },
      ]),
    ).toBe(
      'En <i>mifik</i> &lt;b&gt;<strong>nuevo</strong><code>/llms.txt?a=1&amp;b</code><a href="https://mifik.cl/es/guias/?a=1&amp;b=2">guías</a>',
    );
  });
});
