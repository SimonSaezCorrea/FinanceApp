import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { movementTemplates } from "@finance/contracts";

import i18n from "../../../i18n";
import { NewMovementButton } from "./NewMovementButton";

vi.mock("../../reference/components/CategoryIcon", () => ({ CategoryIcon: () => null }));

const template = (id: string, name: string, amount: string | null = null) =>
  ({
    id,
    name,
    type: "EXPENSE",
    amount,
    currency: amount ? "CLP" : null,
    categoryId: null,
  }) as movementTemplates.MovementTemplate;

function renderButton(templates: movementTemplates.MovementTemplate[]) {
  const onNew = vi.fn();
  const onUseTemplate = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <NewMovementButton templates={templates} onNew={onNew} onUseTemplate={onUseTemplate} />
      </MemoryRouter>
    </I18nextProvider>,
  );
  return { onNew, onUseTemplate };
}

describe("NewMovementButton", () => {
  it("has no template arrow when there are no templates", () => {
    const { onNew } = renderButton([]);
    expect(screen.queryByRole("button", { name: i18n.t("templates.useMenu") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo movimiento/ }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("opens the templates and uses the one picked", () => {
    const { onUseTemplate } = renderButton([
      template("t1", "Bencina", "30000"),
      template("t2", "MoviRed"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("templates.useMenu") }));
    const menu = screen.getByRole("menu");
    expect(menu.textContent).toContain("−$30.000");
    expect(menu.textContent).toContain(i18n.t("templates.freeAmount"));
    fireEvent.click(screen.getByRole("menuitem", { name: /MoviRed/ }));
    expect(onUseTemplate).toHaveBeenCalledWith("t2");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes with Escape", () => {
    renderButton([template("t1", "Bencina")]);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("templates.useMenu") }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
