import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { RowActionsMenu } from "./RowActionsMenu";

function renderMenu() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  // Stands in for the SwipeRow ancestor whose `overflow-hidden` used to clip
  // the panel — the reason it has to be portaled.
  render(
    <I18nextProvider i18n={i18n}>
      <div data-testid="clipping-row" className="overflow-hidden">
        <RowActionsMenu onEdit={onEdit} onDelete={onDelete} />
      </div>
    </I18nextProvider>,
  );
  return {
    trigger: screen.getByRole("button", { name: i18n.t("common.options") }),
    onEdit,
    onDelete,
  };
}

describe("RowActionsMenu", () => {
  it("renders the panel outside the clipping row (portaled), not nested inside it", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu");
    const row = screen.getByTestId("clipping-row");
    // The regression: nested inside the row, `overflow-hidden` cut the panel off
    // and stacked it under the next row, whatever its z-index.
    expect(row.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it("is closed until the trigger is pressed", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs an action and closes on the first click", () => {
    const { trigger, onEdit } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("menuitem", { name: i18n.t("common.edit") }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on a press elsewhere on the page", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders nothing at all when neither action is available", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <RowActionsMenu />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("button", { name: i18n.t("common.options") })).toBeNull();
  });
});
