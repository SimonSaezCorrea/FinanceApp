import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { GenerateStatementPanel } from "./GenerateStatementPanel";

vi.mock("../api/accountsApi", () => ({ accountsApi: { generateStatements: vi.fn() } }));

const account = { id: "a1", currency: "CLP", cards: [] } as unknown as accounts.BankAccount;

function renderPanel(
  statements: Partial<accounts.CreditStatement>[],
  statement: Partial<accounts.CreditStatement> | null = null,
) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <GenerateStatementPanel
          account={account}
          statements={statements as accounts.CreditStatement[]}
          statement={statement as accounts.CreditStatement | null}
          open
          onOpenChange={() => undefined}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("GenerateStatementPanel", () => {
  it("proposes the day after the previous close as the start", () => {
    renderPanel([
      { id: "old", closedAt: new Date(2026, 7, 20, 23, 59, 59, 999).toISOString() },
      {
        id: "open",
        closedAt: null,
        periodStart: new Date(2026, 7, 21).toISOString(),
        amount: "0",
        currency: "CLP",
      },
    ]);
    expect(screen.getByText("21/08/2026")).toBeDefined();
  });

  it("asks for the payment date before it can be generated", () => {
    renderPanel([]);
    const submit = screen.getByRole("button", {
      name: i18n.t("accounts.actions.generateStatements"),
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("edits a generated statement: fills its dates and locks start/close once settled", () => {
    const paid = {
      id: "s1",
      currency: "CLP",
      periodStart: new Date(2026, 6, 21).toISOString(),
      closedAt: new Date(2026, 7, 20, 23, 59, 59, 999).toISOString(),
      dueDate: new Date(2026, 8, 5, 23, 59, 59, 999).toISOString(),
      paidAt: new Date(2026, 8, 1).toISOString(),
      transferredAt: null,
    };
    renderPanel([paid], paid);
    expect(screen.getByText("21/07/2026")).toBeDefined();
    expect(screen.getByText("20/08/2026")).toBeDefined();
    expect(screen.getByText("05/09/2026")).toBeDefined();
    expect(screen.getByText(i18n.t("accounts.generate.lockedSettled"))).toBeDefined();
    expect(
      (screen.getByLabelText(i18n.t("accounts.generate.closedAt")) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(i18n.t("accounts.generate.dueDate")) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
