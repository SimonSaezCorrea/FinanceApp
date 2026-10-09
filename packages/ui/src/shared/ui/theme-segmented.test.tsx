import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import i18n from "../../test/i18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { useTheme } from "../../theme/useTheme";
import { ThemeSegmented } from "./theme-segmented";

function CurrentMode() {
  return <output data-testid="mode">{useTheme().mode}</output>;
}

function renderSwitch() {
  render(
    <ThemeProvider>
      <ThemeSegmented />
      <CurrentMode />
    </ThemeProvider>,
  );
}

describe("ThemeSegmented", () => {
  it("offers Light, Dark and System, named, as one labelled group", () => {
    renderSwitch();
    const group = screen.getByRole("group", { name: i18n.t("theme.label") });
    for (const key of ["theme.light", "theme.dark", "theme.system"]) {
      expect(group.querySelector(`[aria-pressed]`)).toBeTruthy();
      expect(screen.getByRole("button", { name: i18n.t(key) })).toBeTruthy();
    }
  });

  it("marks the current theme and switches to System", () => {
    renderSwitch();
    const system = screen.getByRole("button", { name: i18n.t("theme.system") });
    fireEvent.click(system);
    expect(system.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: i18n.t("theme.dark") }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByTestId("mode").textContent).toBe("system");
  });
});
