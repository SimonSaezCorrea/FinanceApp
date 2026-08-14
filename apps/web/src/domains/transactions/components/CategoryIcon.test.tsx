import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryIcon } from "./CategoryIcon";

/** Mapping to an icon isn't enough: it has to actually RENDER an svg. A name
 *  that doesn't exist in the installed lucide version resolves to `undefined`
 *  and silently draws nothing. */
describe("CategoryIcon renders", () => {
  const categories = [
    null,
    "Entretenimiento",
    "Entretención",
    "Compras",
    "Hogar",
    "Educación",
    "Supermercado",
    "Transporte",
    "Salud",
    "Internet",
    "Celular",
    "Pago facturación",
    "Micro",
    "Ropa",
  ];

  it.each(categories)("draws an icon for %s", (category) => {
    const { container } = render(<CategoryIcon category={category} className="h-4 w-4" />);
    expect(container.querySelector("svg"), String(category)).not.toBeNull();
  });
});
