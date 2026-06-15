import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import i18n from "../../i18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { Badge } from "./badge";
import { Button } from "./button";
import { EmptyState } from "./states";
import { ThemeToggle } from "./theme-toggle";

describe("ui primitives", () => {
  it("renders Button variants", () => {
    render(
      <>
        <Button>primary</Button>
        <Button variant="destructive">danger</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "primary" })).toBeDefined();
    expect(screen.getByRole("button", { name: "danger" })).toBeDefined();
  });

  it("renders a Badge and EmptyState", () => {
    render(
      <>
        <Badge variant="success">ok</Badge>
        <EmptyState title="nothing here" />
      </>,
    );
    expect(screen.getByText("ok")).toBeDefined();
    expect(screen.getByText("nothing here")).toBeDefined();
  });

  it("ThemeToggle exposes the three modes", () => {
    render(
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <ThemeToggle />
        </I18nextProvider>
      </ThemeProvider>,
    );
    expect(screen.getByLabelText(i18n.t("theme.dark"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("theme.light"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("theme.system"))).toBeDefined();
  });
});
