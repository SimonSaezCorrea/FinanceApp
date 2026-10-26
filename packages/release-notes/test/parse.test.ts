import { describe, expect, it } from "vitest";

import { buildCatalog } from "../src/catalog";
import { isReleaseId, parseRelease, tokenizeInline } from "../src/parse";

const ES = `---
title: "Algo nuevo"
summary: Una línea.
commits:
  - ABCDEF12
  - 1234567
---

## Correcciones

- Arreglado un **error**.

## Nuevo

- Una cosa,
  en dos líneas.
- Otra con [enlace](https://mifik.cl/es/) y \`código\`.
`;

const EN = `---
title: Something new
---

## New

- One thing.
`;

const at = (lang: string, id = "2026-10-26-algo") => `/x/releases/${id}/${lang}.md`;

describe("parseRelease", () => {
  it("reads the frontmatter, groups in kind order and joins wrapped lines", () => {
    const r = parseRelease(at("es"), ES);
    expect(r).toMatchObject({
      id: "2026-10-26-algo",
      date: "2026-10-26",
      lang: "es",
      title: "Algo nuevo",
      summary: "Una línea.",
      commits: ["abcdef12", "1234567"],
    });
    expect(r.groups.map((g) => g.kind)).toEqual(["new", "fixed"]);
    expect(r.groups[0]!.items[0]).toEqual([{ type: "text", text: "Una cosa, en dos líneas." }]);
    expect(r.groups[1]!.items[0]).toEqual([
      { type: "text", text: "Arreglado un " },
      { type: "strong", text: "error" },
      { type: "text", text: "." },
    ]);
  });

  it("accepts Windows line endings", () => {
    expect(parseRelease(at("en"), EN.replace(/\n/g, "\r\n")).title).toBe("Something new");
  });

  const broken: [string, string, string, RegExp][] = [
    ["bad folder", at("es", "algo"), ES, /folder/],
    ["impossible date", at("es", "2026-02-30-x"), ES, /folder/],
    ["unknown language", at("pt"), ES, /es or en/],
    ["no frontmatter", at("en"), "## New\n\n- x\n", /frontmatter/],
    ["unknown key", at("en"), EN.replace("title:", "titulo:"), /unknown frontmatter key/],
    ["no title", at("en"), EN.replace("title: Something new", "title: "), /title/],
    [
      "es without commits",
      at("es"),
      ES.replace(/commits:\n {2}- ABCDEF12\n {2}- 1234567\n/, ""),
      /commits/,
    ],
    [
      "en with commits",
      at("en"),
      EN.replace("---\n\n", "commits:\n  - abcdef12\n---\n\n"),
      /es\.md only/,
    ],
    ["bad hash", at("es"), ES.replace("1234567", "xyz"), /not a commit hash/],
    ["unknown heading", at("en"), EN.replace("## New", "## Novedades"), /unknown heading/],
    [
      "heading of the other language",
      at("en"),
      EN.replace("## New", "## Nuevo"),
      /unknown heading/,
    ],
    ["no change", at("en"), "---\ntitle: X\n---\n", /no change/],
    ["empty group", at("en"), EN + "\n## Fixes\n", /has no change/],
    ["stray text", at("en"), EN + "\nA paragraph.\n", /only/],
    ["http link", at("en"), EN.replace("One thing.", "[x](http://a.b)"), /https/],
    ["relative link", at("en"), EN.replace("One thing.", "[x](/es/)"), /https/],
  ];
  for (const [name, path, raw, error] of broken) {
    it(`refuses: ${name}, naming the file`, () => {
      expect(() => parseRelease(path, raw)).toThrow(error);
      expect(() => parseRelease(path, raw)).toThrow(/Release note "/);
    });
  }
});

describe("tokenizeInline", () => {
  it("reads code and links", () => {
    expect(tokenizeInline("ver `/llms.txt` en [fik](https://mifik.cl/)")).toEqual([
      { type: "text", text: "ver " },
      { type: "code", text: "/llms.txt" },
      { type: "text", text: " en " },
      { type: "link", text: "fik", href: "https://mifik.cl/" },
    ]);
  });
});

describe("isReleaseId", () => {
  it("needs a real date and words", () => {
    expect(isReleaseId("2026-10-26-a-b")).toBe(true);
    expect(isReleaseId("2026-13-01-a")).toBe(false);
    expect(isReleaseId("2026-10-26")).toBe(false);
    expect(isReleaseId("2026-10-26-A")).toBe(false);
  });
});

describe("buildCatalog", () => {
  it("pairs the languages, newest first", () => {
    const records = buildCatalog([
      { path: at("es", "2026-10-26-a"), raw: ES },
      { path: at("en", "2026-10-26-a"), raw: EN },
      { path: at("es", "2026-11-02-b"), raw: ES },
      { path: at("en", "2026-11-02-b"), raw: EN },
    ]);
    expect(records.map((r) => r.id)).toEqual(["2026-11-02-b", "2026-10-26-a"]);
    expect(records[0]!.commits).toEqual(["abcdef12", "1234567"]);
    expect(records[0]!.byLanguage.en.title).toBe("Something new");
  });
  it("refuses a record in one language only", () => {
    expect(() => buildCatalog([{ path: at("es"), raw: ES }])).toThrow(/2026-10-26-algo\/en\.md/);
  });
});
