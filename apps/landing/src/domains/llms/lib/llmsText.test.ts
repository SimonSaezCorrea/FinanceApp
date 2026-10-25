import { describe, expect, it } from "vitest";

import { llmsText } from "./llmsText";

const link = {
  title: "Precios",
  url: "https://mifik.cl/es/pricing/",
  description: "fik es gratis.",
};

describe("llmsText", () => {
  it("follows llmstxt.org: H1, summary quote, then link sections", () => {
    const text = llmsText({
      appUrl: "https://app.mifik.cl",
      sections: [{ heading: "Pages in Spanish", links: [link] }],
      rates: [],
    });
    expect(text.startsWith("# fik\n\n> ")).toBe(true);
    expect(text).toContain(
      "## Pages in Spanish\n- [Precios](https://mifik.cl/es/pricing/): fik es gratis.",
    );
    expect(text).toContain("https://app.mifik.cl");
    expect(text).not.toContain("Today's indicators");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("lists today's indicators when the build had them, and skips empty sections", () => {
    const text = llmsText({
      appUrl: "https://app.mifik.cl",
      sections: [{ heading: "Guides (es)", links: [] }],
      rates: [
        {
          name: "UF",
          value: "39500.12",
          valueDate: "2026-10-25",
          url: "https://mifik.cl/en/uf-value/",
        },
      ],
    });
    expect(text).toContain(
      "- [UF](https://mifik.cl/en/uf-value/): 39500.12 Chilean pesos (value published 2026-10-25)",
    );
    expect(text).not.toContain("## Guides (es)");
  });
});
