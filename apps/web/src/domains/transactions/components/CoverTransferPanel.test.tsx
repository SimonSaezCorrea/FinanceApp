import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { accounts, customFields } from "@finance/contracts";

import i18n from "../../../i18n";
import { transactionsApi } from "../api/transactionsApi";
import { CoverTransferPanel } from "./CoverTransferPanel";

vi.mock("../api/transactionsApi", () => ({
  transactionsApi: { transfer: { cover: vi.fn() } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const FIELD = "019a0000-0000-7000-8000-0000000000f1";
const field = {
  id: FIELD,
  name: "Transferido",
  type: "BOOLEAN",
  options: [],
  scope: { movementKinds: [], accountIds: [], cardKinds: [] },
  scopeBroken: false,
  defaultValue: false,
  showAsColumn: false,
  sortOrder: 0,
  valueCount: 0,
} as customFields.CustomField;
const account = (id: string, name: string, currency = "CLP") =>
  ({
    id,
    name,
    type: "CHECKING",
    currency,
    status: "ACTIVE",
    cards: [],
  }) as unknown as accounts.BankAccount;

function renderPanel() {
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <CoverTransferPanel
          open
          onOpenChange={vi.fn()}
          field={field}
          value
          target={{ filter: { cf: FIELD, cfv: "false" } }}
          count={12}
          amount={{ value: "184500", currency: "CLP" }}
          accounts={[
            account("a1", "Corriente"),
            account("a2", "MACH"),
            account("a3", "Dólares", "USD"),
          ]}
          onDone={onDone}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onDone };
}

// The account pickers are searchable lists: open one, then pick the option button.
const choose = async (label: string, option: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  const options = await screen.findAllByRole("button", { name: new RegExp(`^${option}`) });
  fireEvent.click(options[options.length - 1]!);
};

describe("CoverTransferPanel (specs/036, US6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("es");
  });

  it("shows the amount, the count and what they become before confirming, then transfers", async () => {
    vi.mocked(transactionsApi.transfer.cover).mockResolvedValue({
      transfer: {} as never,
      covered: 12,
    });
    const { onDone } = renderPanel();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("$184.500")).toBeTruthy();
    expect(within(dialog).getByText("12")).toBeTruthy();
    expect(within(dialog).getByText("Transferido: Sí")).toBeTruthy();

    await choose(i18n.t("customFields.cover.from"), "Corriente");
    await choose(i18n.t("customFields.cover.to"), "MACH");
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.cover.confirm") }));
    await waitFor(() => expect(transactionsApi.transfer.cover).toHaveBeenCalled());
    const [body, key] = vi.mocked(transactionsApi.transfer.cover).mock.calls[0]!;
    expect(body).toEqual({
      fieldId: FIELD,
      target: { filter: { cf: FIELD, cfv: "false" } },
      value: true,
      fromBankAccountId: "a1",
      toBankAccountId: "a2",
    });
    expect(key).toBeTypeOf("string");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
