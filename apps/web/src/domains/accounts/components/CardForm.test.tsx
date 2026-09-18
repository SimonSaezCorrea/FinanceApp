import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { accounts } from "@finance/contracts";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { CardForm } from "./CardForm";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana",
    preferredCurrency: "CLP",
    extraCurrencies: [],
    locale: "es",
    theme: "dark",
    memberSinceYear: 2024,
    hideBalances: false,
    ...overrides,
  };
}

async function renderForm(
  onSubmit = vi.fn(),
  props: Partial<{
    hasExistingPrimary: boolean;
    accountCurrency: string;
    accountType: accounts.AccountType;
    currencies: { id: string; code: string; numeric: string; name: string }[];
    extraCurrencies: string[];
  }> = {},
) {
  me.mockResolvedValue(
    baseUser({
      preferredCurrency: props.accountCurrency ?? "CLP",
      extraCurrencies: props.extraCurrencies ?? [],
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (props.currencies) {
    qc.setQueryData(["currencies"], props.currencies);
  }
  render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <CardForm
            submitLabel="add"
            accountCurrency={props.accountCurrency ?? "CLP"}
            accountType={props.accountType ?? "CHECKING"}
            hasExistingPrimary={props.hasExistingPrimary ?? false}
            onSubmit={onSubmit}
          />
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  // The logged-in user resolves asynchronously (AuthProvider's own effect) —
  // wait for the form's first field before interacting with it.
  await waitFor(() => expect(screen.getByLabelText(i18n.t("cards.form.last4"))).toBeDefined());
  return onSubmit;
}

function fillExpiry() {
  fireEvent.change(screen.getByLabelText(i18n.t("cards.form.expiry")), {
    target: { value: "0129" },
  });
}

describe("CardForm", () => {
  it("has no field that could ever collect a full card number — only the last 4 digits", async () => {
    await renderForm();
    expect(screen.queryByLabelText(/número/i)).toBeNull();
    expect(screen.getByLabelText(i18n.t("cards.form.last4"))).toBeDefined();
  });

  it("submits the last 4 digits + parsed MM/AA expiry (non-credit kind, no limit fields)", async () => {
    const onSubmit = await renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.name")), {
      target: { value: "Visa" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "1234" },
    });
    fillExpiry();
    fireEvent.submit(screen.getByText("add").closest("form")!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.last4).toBe("1234");
    expect(payload.expiryMonth).toBe(1);
    expect(payload.expiryYear).toBe(2029);
  });

  it("defaults the name to the card kind when left blank", async () => {
    const onSubmit = await renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "4821" },
    });
    fillExpiry();
    fireEvent.submit(screen.getByText("add").closest("form")!);

    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.name).toBe(i18n.t("cards.kind.DEBIT"));
  });

  it("rejects a last4 that isn't exactly 4 digits", async () => {
    const onSubmit = await renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "12" },
    });
    fillExpiry();
    fireEvent.submit(screen.getByText("add").closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range expiry month (e.g. 13/29)", async () => {
    const onSubmit = await renderForm();
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("cards.form.expiry")), {
      target: { value: "1329" },
    });
    fireEvent.submit(screen.getByText("add").closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  describe("CREDIT — first card on the account (becomes primary)", () => {
    it("requires a limit before submitting", async () => {
      const onSubmit = await renderForm(vi.fn(), { accountType: "CREDIT_CARD" });
      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
        target: { value: "1234" },
      });
      fillExpiry();
      fireEvent.submit(screen.getByText("add").closest("form")!);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(i18n.t("cards.errors.limitRequired"))).toBeDefined();
    });

    it("submits with usesAccountPool: true and a limits entry in the account currency", async () => {
      const onSubmit = await renderForm(vi.fn(), {
        accountType: "CREDIT_CARD",
        accountCurrency: "CLP",
      });
      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
        target: { value: "1234" },
      });
      fillExpiry();
      fireEvent.change(
        screen.getByLabelText(i18n.t("cards.form.primaryLimit", { currency: "CLP" })),
        { target: { value: "1500000" } },
      );
      fireEvent.submit(screen.getByText("add").closest("form")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0]![0];
      expect(payload.limits).toEqual([{ currency: "CLP", limitAmount: "1500000" }]);
    });

    it("offers an optional extra-currency limit, excluding the account's own currency", async () => {
      const onSubmit = await renderForm(vi.fn(), {
        accountType: "CREDIT_CARD",
        accountCurrency: "CLP",
        extraCurrencies: ["EUR", "USD"],
        currencies: [
          { id: "1", code: "CLP", numeric: "152", name: "Peso chileno" },
          { id: "2", code: "EUR", numeric: "978", name: "Euro" },
          { id: "3", code: "USD", numeric: "840", name: "US Dollar" },
        ],
      });
      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
        target: { value: "1234" },
      });
      fillExpiry();
      fireEvent.change(
        screen.getByLabelText(i18n.t("cards.form.primaryLimit", { currency: "CLP" })),
        { target: { value: "1500000" } },
      );
      fireEvent.click(screen.getByText(i18n.t("cards.form.addLimit")));

      // Opens the custom currency dropdown: CLP (already covered by the
      // mandatory field above) must not be offered as an extra currency.
      fireEvent.click(screen.getByLabelText(i18n.t("cards.form.currency")));
      expect(screen.queryByText(/Peso chileno/)).toBeNull();
      fireEvent.click(screen.getByText(/US Dollar/));

      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.limit")), {
        target: { value: "500" },
      });
      fireEvent.submit(screen.getByText("add").closest("form")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0]![0];
      expect(payload.limits).toEqual([
        { currency: "CLP", limitAmount: "1500000" },
        { currency: "USD", limitAmount: "500" },
      ]);
    });

    it("submits successfully with the extra-currency row left empty (fully optional)", async () => {
      const onSubmit = await renderForm(vi.fn(), {
        accountType: "CREDIT_CARD",
        accountCurrency: "CLP",
        extraCurrencies: ["USD"],
        currencies: [
          { id: "1", code: "CLP", numeric: "152", name: "Peso chileno" },
          { id: "2", code: "USD", numeric: "840", name: "US Dollar" },
        ],
      });
      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
        target: { value: "1234" },
      });
      fillExpiry();
      fireEvent.change(
        screen.getByLabelText(i18n.t("cards.form.primaryLimit", { currency: "CLP" })),
        { target: { value: "1500000" } },
      );
      fireEvent.click(screen.getByText(i18n.t("cards.form.addLimit")));
      fireEvent.submit(screen.getByText("add").closest("form")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0]![0];
      expect(payload.limits).toEqual([{ currency: "CLP", limitAmount: "1500000" }]);
    });
  });

  describe("CREDIT — additional card (a primary already exists)", () => {
    it("defaults to sharing the account pool with no limit rows required", async () => {
      const onSubmit = await renderForm(vi.fn(), {
        accountType: "CREDIT_CARD",
        hasExistingPrimary: true,
      });
      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
        target: { value: "1234" },
      });
      fillExpiry();
      fireEvent.submit(screen.getByText("add").closest("form")!);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0]![0];
      expect(payload.usesAccountPool).toBe(true);
      expect(payload.limits).toBeUndefined();
    });

    it("requires at least one limit row after switching to 'own limit'", async () => {
      const onSubmit = await renderForm(vi.fn(), {
        accountType: "CREDIT_CARD",
        hasExistingPrimary: true,
      });
      fireEvent.change(screen.getByLabelText(i18n.t("cards.form.last4")), {
        target: { value: "1234" },
      });
      fillExpiry();
      fireEvent.click(screen.getByText(i18n.t("cards.form.ownLimit")));
      fireEvent.submit(screen.getByText("add").closest("form")!);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
