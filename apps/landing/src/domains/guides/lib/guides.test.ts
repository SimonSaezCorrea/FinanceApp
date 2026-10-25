import { describe, expect, it } from "vitest";

import { type GuideEntry, guidePath, pairOf, sortForIndex, toGuides } from "./guides";

const entry = (id: string, overrides: Partial<GuideEntry["data"]> = {}): GuideEntry => ({
  id,
  data: {
    title: `Title ${id}`,
    description: "A guide.",
    address: id.replace("/", "-"),
    publishedAt: new Date("2026-10-01"),
    reviewedAt: new Date("2026-10-10"),
    sources: [{ name: "CMF", title: "Estado de cuenta", url: "https://www.cmfchile.cl/" }],
    ...overrides,
  },
});

describe("guidePath", () => {
  it("puts each guide under the section of its language", () => {
    expect(guidePath("es", "fecha-de-cierre-tarjeta")).toBe("/es/guias/fecha-de-cierre-tarjeta/");
    expect(guidePath("en", "credit-card-statement-dates")).toBe(
      "/en/guides/credit-card-statement-dates/",
    );
  });
});

describe("toGuides", () => {
  it("reads the key and language from the file path", () => {
    const [guide] = toGuides([entry("statement-dates/es", { address: "fecha-de-cierre-tarjeta" })]);
    expect(guide).toMatchObject({
      key: "statement-dates",
      lang: "es",
      path: "/es/guias/fecha-de-cierre-tarjeta/",
      author: "Simón Sáez",
    });
  });

  it("refuses a file that is not es or en, naming it", () => {
    expect(() => toGuides([entry("statement-dates/fr")])).toThrow(/statement-dates\/fr/);
  });

  it("refuses two guides with the same address in one language, naming both", () => {
    expect(() =>
      toGuides([entry("a/es", { address: "same" }), entry("b/es", { address: "same" })]),
    ).toThrow(/a\/es.*b\/es|b\/es.*a\/es/);
  });

  it("allows the same address in two languages", () => {
    expect(
      toGuides([entry("a/es", { address: "same" }), entry("a/en", { address: "same" })]),
    ).toHaveLength(2);
  });

  it("refuses a review date before the publication date", () => {
    expect(() =>
      toGuides([
        entry("a/es", {
          publishedAt: new Date("2026-10-10"),
          reviewedAt: new Date("2026-10-01"),
        }),
      ]),
    ).toThrow(/a\/es/);
  });
});

describe("pairOf", () => {
  it("finds the same guide in the other language, or nothing", () => {
    const guides = toGuides([entry("a/es"), entry("a/en"), entry("b/es")]);
    const aEs = guides.find((g) => g.key === "a" && g.lang === "es")!;
    const bEs = guides.find((g) => g.key === "b")!;
    expect(pairOf(aEs, guides)?.lang).toBe("en");
    expect(pairOf(bEs, guides)).toBeNull();
  });
});

describe("sortForIndex", () => {
  it("lists one language, newest review first, then by title", () => {
    const guides = toGuides([
      entry("old/es", { title: "B", reviewedAt: new Date("2026-10-02") }),
      entry("new/es", { title: "Z", reviewedAt: new Date("2026-10-20") }),
      entry("tie/es", { title: "A", reviewedAt: new Date("2026-10-02") }),
      entry("new/en", { reviewedAt: new Date("2026-10-30") }),
    ]);
    expect(sortForIndex(guides, "es").map((g) => g.key)).toEqual(["new", "tie", "old"]);
  });
});
