import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { brandHtml, withBrand } from "./brand";

describe("withBrand", () => {
  it("puts the product name in italics, keeping the rest of the sentence", () => {
    const { container } = render(<p>{withBrand("Entra a mifik y pide otro enlace.")}</p>);
    expect(container.innerHTML).toBe("<p>Entra a <i>mifik</i> y pide otro enlace.</p>");
  });

  it("leaves a sentence without the word, and words that only contain it, as they are", () => {
    expect(withBrand("Sin la marca")).toBe("Sin la marca");
    for (const text of ["Escríbenos a contacto@mifik.cl", "Visita mifik.cl", "https://mifik.cl/"]) {
      const { container } = render(<p>{withBrand(text)}</p>);
      expect(container.querySelector("i")).toBeNull();
    }
  });
});

describe("brandHtml", () => {
  it("escapes the text before adding the italics", () => {
    expect(brandHtml("<b>mifik</b> & mifik.cl")).toBe(
      "&lt;b&gt;<i>mifik</i>&lt;/b&gt; &amp; mifik.cl",
    );
  });
});
