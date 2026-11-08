import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import { Providers } from "../../../app/providers";
import { SpendBreakdown } from "./SpendBreakdown";

vi.mock("../../reference/api/referenceApi", () => ({
  referenceApi: { categories: vi.fn().mockResolvedValue([]) },
}));

const accountList = [
  { id: "a1", name: "Cuenta Corriente BCI", cards: [] },
  { id: "a2", name: "Visa Crédito", cards: [] },
] as unknown as accounts.BankAccount[];

function renderBreakdown(byHolder: { holder: string | null; total: string }[]) {
  return render(
    <Providers>
      <SpendBreakdown
        categories={[{ categoryId: null, total: "5000" }]}
        byAccount={[
          { accountId: "a2", total: "3000" },
          { accountId: "a1", total: "2000" },
        ]}
        byHolder={byHolder}
        accountList={accountList}
        loading={false}
      />
    </Providers>,
  );
}

describe("SpendBreakdown", () => {
  it("switches the cut to accounts", () => {
    renderBreakdown([{ holder: null, total: "5000" }]);
    expect(screen.queryByText("Visa Crédito")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cuenta" }));
    expect(screen.getByText("Visa Crédito")).toBeDefined();
    expect(screen.getByText("Cuenta Corriente BCI")).toBeDefined();
  });

  it("offers Titular only when someone besides the owner spent", () => {
    renderBreakdown([{ holder: null, total: "5000" }]);
    expect(screen.queryByRole("button", { name: "Titular" })).toBeNull();
  });

  it("shows each cardholder under Titular", () => {
    renderBreakdown([
      { holder: "Camila", total: "3000" },
      { holder: null, total: "2000" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Titular" }));
    expect(screen.getByText("Camila")).toBeDefined();
    expect(screen.getByText("Tú")).toBeDefined();
  });
});
