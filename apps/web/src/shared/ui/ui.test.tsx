import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { Badge } from "./badge";
import { Button } from "./button";
import { CollapsibleSection } from "./collapsible-section";
import { EmptyState } from "./states";
import { Switch } from "./switch";
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

  it("Switch toggles and reports its checked state", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="test switch" />);
    const el = screen.getByRole("switch", { name: "test switch" });
    expect(el.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(el);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("Switch does not respond to clicks when disabled", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        checked={false}
        onCheckedChange={onCheckedChange}
        disabled
        aria-label="inert switch"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "inert switch" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("CollapsibleSection starts closed and reveals its content on click", () => {
    render(
      <CollapsibleSection title="Section title">
        <span>hidden content</span>
      </CollapsibleSection>,
    );
    expect(screen.queryByText("hidden content")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Section title" }));
    expect(screen.getByText("hidden content")).toBeDefined();
  });

  it("CollapsibleSection honors defaultOpen", () => {
    render(
      <CollapsibleSection title="Open by default" defaultOpen>
        <span>visible content</span>
      </CollapsibleSection>,
    );
    expect(screen.getByText("visible content")).toBeDefined();
  });
});
