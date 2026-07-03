import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
  it("renders name, type, status, currency and balance fields", () => {
    renderForm();
    expect(screen.getByLabelText(i18n.t("accounts.form.name"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.type"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.status"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.currency"))).toBeDefined();
    expect(screen.getByLabelText(i18n.t("accounts.form.initialBalance"))).toBeDefined();
  });
});
