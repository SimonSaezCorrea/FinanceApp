import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { accountsApi } from "../api/accountsApi";
import { AccountCreateModal } from "./AccountCreateModal";

vi.mock("../api/accountsApi", () => ({
  accountsApi: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../reference/api/referenceApi", () => ({
  referenceApi: {
    institutions: vi.fn().mockResolvedValue([]),
    currencies: vi
      .fn()
      .mockResolvedValue([{ id: "1", code: "CLP", numeric: "152", name: "Peso chileno" }]),
  },
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AccountCreateModal open onOpenChange={vi.fn()} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("AccountCreateModal — CREDIT_LINE primary card shortcut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auto-creates the primary card from the últimos-4-dígitos/vencimiento fields, as the first card, instead of requiring a separate 'add card' step", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(i18n.t("accounts.form.name")), {
      target: { value: "CMR Falabella" },
    });
    fireEvent.click(screen.getByText(i18n.t("accounts.type.CREDIT_LINE")));

    // The generic "Número de cuenta" field is gone; últimos 4 dígitos/vencimiento show instead.
    expect(screen.queryByLabelText(i18n.t("accounts.form.accountNumber"))).toBeNull();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "4827" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.expiry")), {
      target: { value: "0529" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("accounts.form.creditLimit")), {
      target: { value: "3000000" },
    });

    fireEvent.click(screen.getByText(i18n.t("accounts.form.createSubmit")));

    await waitFor(() => expect(accountsApi.create).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(accountsApi.create).mock.calls[0]![0];
    expect(payload.creditLimit).toBe("3000000");
    expect(payload.accountNumber).toBeUndefined();
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards![0]).toMatchObject({
      kind: "CREDIT",
      last4: "4827",
      expiryMonth: 5,
      expiryYear: 2029,
      limits: [{ currency: "CLP", limitAmount: "3000000" }],
    });
  });

  it("blocks submission with an inline error when últimos 4 dígitos is missing for a CREDIT_LINE account", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(i18n.t("accounts.form.name")), {
      target: { value: "CMR Falabella" },
    });
    fireEvent.click(screen.getByText(i18n.t("accounts.type.CREDIT_LINE")));
    fireEvent.click(screen.getByText(i18n.t("accounts.form.createSubmit")));

    expect(accountsApi.create).not.toHaveBeenCalled();
    expect(screen.getByText(i18n.t("cards.errors.last4"))).toBeDefined();
  });
});
