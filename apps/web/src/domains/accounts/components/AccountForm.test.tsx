import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { AccountForm } from "./AccountForm";

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AccountForm submitLabel="Save" onSubmit={vi.fn()} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("AccountForm", () => {
  it("renders name, type toggle, active switch, currency and balance fields", () => {
    renderForm();
    expect(screen.getByLabelText(i18n.t("accounts.form.name"))).toBeDefined();
    expect(
      screen.getByRole("group", { name: i18n.t("accounts.form.type") }),
    ).toBeDefined();
    expect(
      screen.getByRole("switch", { name: i18n.t("accounts.form.accountActive") }),
    ).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.currency"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.initialBalance"))).toBeDefined();
  });

  it("switches account type by clicking a toggle button (not a dropdown)", () => {
    renderForm();
    fireEvent.click(screen.getByText(i18n.t("accounts.type.SAVINGS")));
    const savingsButton = screen.getByText(i18n.t("accounts.type.SAVINGS")).closest("button")!;
    expect(savingsButton.getAttribute("aria-pressed")).toBe("true");
    // Institution/account number fields only apply to non-CASH; SAVINGS keeps them.
    expect(screen.getByLabelText(i18n.t("accounts.form.institution"))).toBeDefined();
  });

  it("toggles active/inactive via the switch", () => {
    renderForm();
    const toggle = screen.getByRole("switch", { name: i18n.t("accounts.form.accountActive") });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
