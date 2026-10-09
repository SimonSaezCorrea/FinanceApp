import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import i18n from "../../i18n";
import { MonthPicker } from "./month-picker";

function Harness() {
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  return (
    <I18nextProvider i18n={i18n}>
      <MonthPicker value={month} onChange={setMonth} />
      <span data-testid="value">{`${month.getFullYear()}-${month.getMonth() + 1}`}</span>
    </I18nextProvider>
  );
}

describe("MonthPicker", () => {
  it("steps months with the arrows", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.nextMonth")));
    expect(screen.getByTestId("value").textContent).toBe("2026-11");
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.previousMonth")));
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.previousMonth")));
    expect(screen.getByTestId("value").textContent).toBe("2026-9");
  });

  it("opens a year of months and picks one in another year", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(i18n.t("common.date.chooseMonth")) }),
    );
    expect(screen.getByText("2026")).toBeDefined();
    fireEvent.click(screen.getByLabelText(i18n.t("common.date.previousYear")));
    fireEvent.click(screen.getByRole("button", { name: /^mar$/i }));
    expect(screen.getByTestId("value").textContent).toBe("2025-3");
    expect(screen.queryByText("2025")).toBeNull(); // closed after picking
  });
});
