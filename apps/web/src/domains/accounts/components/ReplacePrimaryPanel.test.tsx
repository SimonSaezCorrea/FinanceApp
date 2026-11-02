import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { cardsApi } from "../api/cardsApi";
import { PrimaryCardNotice } from "./PrimaryCardNotice";
import { ReplacePrimaryPanel, type ReplacePrimaryMode } from "./ReplacePrimaryPanel";

vi.mock("../api/cardsApi", () => ({
  cardsApi: { makePrimary: vi.fn(), replacePrimary: vi.fn(), add: vi.fn() },
}));

const card = (over: Partial<accounts.Card>): accounts.Card => ({
  id: "p",
  name: "Visa titular",
  kind: "CREDIT",
  last4: "1111",
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

const account = (cards: accounts.Card[]) =>
  ({
    id: "acc_1",
    type: "CREDIT_CARD",
    currency: "CLP",
    creditLimit: "1000000",
    creditPools: [],
    cards,
  }) as unknown as accounts.BankAccount;

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
    </QueryClientProvider>,
  );
}

function renderPanel(cards: accounts.Card[], mode: ReplacePrimaryMode, primary: accounts.Card) {
  return renderWith(
    <ReplacePrimaryPanel
      account={account(cards)}
      card={primary}
      mode={mode}
      open
      onOpenChange={() => {}}
    />,
  );
}

describe("ReplacePrimaryPanel (spec 039)", () => {
  beforeEach(() => {
    void i18n.changeLanguage("es");
    vi.clearAllMocks();
    vi.mocked(cardsApi.replacePrimary).mockResolvedValue({} as accounts.BankAccount);
    vi.mocked(cardsApi.makePrimary).mockResolvedValue({} as accounts.BankAccount);
  });

  it("deactivates the primary naming an existing card, with an idempotency key", async () => {
    const primary = card({ id: "p", isPrimary: true });
    renderPanel(
      [primary, card({ id: "a", name: "Adicional", last4: "2222" })],
      "DEACTIVATE",
      primary,
    );
    expect(screen.getByText(i18n.t("accounts.primary.poolsUnchanged"))).toBeDefined();

    fireEvent.click(screen.getByText(i18n.t("accounts.primary.confirmDeactivate")));

    await waitFor(() => expect(cardsApi.replacePrimary).toHaveBeenCalledTimes(1));
    const [accountId, cardId, body, key] = vi.mocked(cardsApi.replacePrimary).mock.calls[0]!;
    expect([accountId, cardId]).toEqual(["acc_1", "p"]);
    expect(body).toEqual({ action: "DEACTIVATE", replacement: { cardId: "a" } });
    expect(key).toMatch(/.{8,}/);
  });

  it("with no other active credit card, asks for the new card and checks its four digits", async () => {
    const primary = card({ id: "p", isPrimary: true });
    renderPanel([primary, card({ id: "x", isActive: false })], "DELETE", primary);
    expect(screen.getByText(i18n.t("accounts.primary.noCandidates"))).toBeDefined();

    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByText(i18n.t("accounts.primary.confirmDelete")));
    expect(screen.getByText(i18n.t("cards.errors.last4"))).toBeDefined();
    expect(cardsApi.replacePrimary).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "9999" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.expiry")), {
      target: { value: "04/32" },
    });
    fireEvent.click(screen.getByText(i18n.t("accounts.primary.confirmDelete")));

    await waitFor(() => expect(cardsApi.replacePrimary).toHaveBeenCalledTimes(1));
    expect(vi.mocked(cardsApi.replacePrimary).mock.calls[0]![2]).toMatchObject({
      action: "DELETE",
      replacement: { newCard: { last4: "9999", expiryMonth: 4, expiryYear: 2032 } },
    });
  });

  it("in CHOOSE mode, an existing card is made primary directly", async () => {
    const inactive = card({ id: "p", isPrimary: true, isActive: false });
    renderPanel([inactive, card({ id: "a", last4: "2222" })], "CHOOSE", inactive);

    fireEvent.click(screen.getByText(i18n.t("accounts.primary.confirmChoose")));

    await waitFor(() => expect(cardsApi.makePrimary).toHaveBeenCalledWith("acc_1", "a"));
    expect(cardsApi.replacePrimary).not.toHaveBeenCalled();
  });
});

describe("PrimaryCardNotice (spec 039)", () => {
  beforeEach(() => void i18n.changeLanguage("es"));

  it("shows only when the credit cards have no active primary", () => {
    const { unmount } = renderWith(
      <PrimaryCardNotice account={account([card({ id: "p", isPrimary: true })])} />,
    );
    expect(screen.queryByText(i18n.t("accounts.primary.noticeTitle"))).toBeNull();
    unmount();

    renderWith(
      <PrimaryCardNotice
        account={account([card({ id: "p", isPrimary: true, isActive: false }), card({ id: "a" })])}
      />,
    );
    expect(screen.getByText(i18n.t("accounts.primary.noticeTitle"))).toBeDefined();
    fireEvent.click(screen.getByText(i18n.t("accounts.primary.noticeAction")));
    expect(screen.getByText(i18n.t("accounts.primary.chooseDescription"))).toBeDefined();
  });
});
