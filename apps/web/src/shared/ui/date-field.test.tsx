import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import i18n from "../../i18n";
import { DateField } from "./date-field";

function Harness({ start = "2026-08-12" }: { start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <I18nextProvider i18n={i18n}>
      <DateField value={value} onChange={setValue} aria-label="fecha" clearable />
      <output data-testid="value">{value}</output>
    </I18nextProvider>
  );
}

const open = () => fireEvent.click(screen.getByLabelText("fecha"));

describe("DateField", () => {
  it("shows the date and opens the app's own calendar", () => {
    render(<Harness />);
    expect(screen.getByText("12/08/2026")).toBeDefined();
    open();
    expect(screen.getByText("agosto de 2026")).toBeDefined();
  });

  it("picks a day, in local time (not shifted a day by UTC parsing)", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "21" }));
    expect(screen.getByTestId("value").textContent).toBe("2026-08-21");
  });

  it("walks months", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.previousMonth")));
    expect(screen.getByText("julio de 2026")).toBeDefined();
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.nextMonth")));
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.nextMonth")));
    expect(screen.getByText("septiembre de 2026")).toBeDefined();
  });

  it("clears the value when allowed", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByText(i18n.t("common.date.clear")));
    expect(screen.getByTestId("value").textContent).toBe("");
  });

  it("closes on Escape without changing anything", () => {
    render(<Harness />);
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("agosto de 2026")).toBeNull();
    expect(screen.getByTestId("value").textContent).toBe("2026-08-12");
  });
});
