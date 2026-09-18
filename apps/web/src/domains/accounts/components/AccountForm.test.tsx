import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { AccountForm } from "./AccountForm";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

async function renderForm() {
  me.mockResolvedValue({
    id: "u1",
    email: "a@b.com",
    name: "Ana",
    preferredCurrency: "CLP",
    extraCurrencies: [],
    locale: "es",
    theme: "dark",
    memberSinceYear: 2024,
    hideBalances: false,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <AccountForm submitLabel="Save" onSubmit={vi.fn()} />
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText(i18n.t("accounts.form.name"))).toBeDefined());
  return result;
}

describe("AccountForm", () => {
  it("renders name, type picker, active switch, currency and balance fields", async () => {
    await renderForm();
    expect(screen.getByLabelText(i18n.t("accounts.form.name"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.type"))).toBeDefined();
    expect(
      screen.getByRole("switch", { name: i18n.t("accounts.form.accountActive") }),
    ).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.currency"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.initialBalance"))).toBeDefined();
  });

  it("switches account type via the dropdown", async () => {
    await renderForm();
    // The type picker is the app's own panel, not a native <select>: open it
    // and choose, the way the user does.
    fireEvent.click(screen.getByLabelText(i18n.t("accounts.form.type")));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("accounts.type.SAVINGS") }));
    // Institution/account number fields only apply to non-CASH; SAVINGS keeps them.
    expect(screen.getByLabelText(i18n.t("accounts.form.institution"))).toBeDefined();
  });

  it("toggles active/inactive via the switch", async () => {
    await renderForm();
    const toggle = screen.getByRole("switch", { name: i18n.t("accounts.form.accountActive") });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
