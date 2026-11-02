import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { CardDetailPanel } from "./CardDetailPanel";

vi.mock("../hooks/useCardMovements", () => ({
  useCardMovements: () => ({ summary: null, recent: [], summaryLoading: false, loading: false }),
}));
vi.mock("../../installments/hooks/useInstallments", () => ({
  useInstallments: () => ({ data: [] }),
}));
vi.mock("../../reference/hooks/useCategoryCatalog", () => ({
  useCategoryCatalog: () => ({ nameOf: () => "" }),
}));

const card = (over: Partial<accounts.Card>): accounts.Card => ({
  id: "a",
  name: "Adicional",
  kind: "CREDIT",
  last4: "2222",
  expiryMonth: 6,
  expiryYear: 2031,
  isActive: true,
  isPrimary: false,
  isVirtual: false,
  isAdditional: false,
  cardholderName: null,
  network: null,
  ownUsed: "0",
  limits: [],
  ...over,
});

const account = {
  id: "acc_1",
  type: "CREDIT_CARD",
  currency: "CLP",
  creditLimit: "1000000",
  creditUsed: "0",
  creditPools: [
    { currency: "CLP", limit: "1000000", used: "0" },
    { currency: "USD", limit: "3000", used: "100" },
  ],
  cards: [],
} as unknown as accounts.BankAccount;

function renderPanel(c: accounts.Card, onMakePrimary = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <CardDetailPanel account={account} card={c} onMakePrimary={onMakePrimary} />
    </I18nextProvider>,
  );
  return onMakePrimary;
}

describe("CardDetailPanel (spec 039)", () => {
  beforeEach(() => void i18n.changeLanguage("es"));

  it("offers 'Marcar como principal' on an active additional credit card", () => {
    const onMakePrimary = renderPanel(card({}));
    fireEvent.click(screen.getByText(i18n.t("accounts.primary.makePrimary")));
    expect(onMakePrimary).toHaveBeenCalledTimes(1);
  });

  it("never offers it on the primary", () => {
    renderPanel(card({ isPrimary: true }));
    expect(screen.queryByText(i18n.t("accounts.primary.makePrimary"))).toBeNull();
  });

  it("never offers it on an inactive card", () => {
    renderPanel(card({ isActive: false }));
    expect(screen.queryByText(i18n.t("accounts.primary.makePrimary"))).toBeNull();
  });

  it("the primary shows the account's credit in other currencies", () => {
    renderPanel(card({ isPrimary: true }));
    expect(screen.getByText(i18n.t("accounts.pools.title"))).toBeDefined();
    expect(screen.getByText("USD")).toBeDefined();
  });
});
