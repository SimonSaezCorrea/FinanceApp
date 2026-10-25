import { describe, expect, it } from "vitest";

import { guideMarkdown } from "./markdown";

const guide = {
  title: "Fecha de cierre",
  description: "Qué es la fecha de cierre.",
  author: "Equipo fik",
  sources: [{ name: "CMF", title: "Estado de cuenta", url: "https://www.cmfchile.cl/x" }],
};
const labels = {
  published: "Publicada el 23 de octubre de 2026",
  reviewed: "Revisada el 23 de octubre de 2026",
  sources: "Fuentes",
  notice: "Información general.",
};

describe("guideMarkdown", () => {
  it("puts the title, summary, address, body, sources and notice in that order", () => {
    const md = guideMarkdown(
      guide,
      "\n## Las dos fechas\n\nTexto.\n",
      "https://mifik.cl/es/guias/x/",
      labels,
    );
    expect(md).toBe(
      [
        "# Fecha de cierre",
        "> Qué es la fecha de cierre.",
        "- URL: https://mifik.cl/es/guias/x/\n- Publicada el 23 de octubre de 2026\n- Revisada el 23 de octubre de 2026\n- Equipo fik",
        "## Las dos fechas\n\nTexto.",
        "## Fuentes\n- [CMF: Estado de cuenta](https://www.cmfchile.cl/x)",
        "_Información general._",
      ].join("\n\n") + "\n",
    );
  });
});
