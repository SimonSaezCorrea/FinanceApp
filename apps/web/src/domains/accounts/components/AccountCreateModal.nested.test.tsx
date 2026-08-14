import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { AccountCreateModal } from "./AccountCreateModal";

// The preview tile renders `MaskedAmount`, which reads the user's
// hide-balances preference — so the tree needs a real AuthProvider, with the
// session call stubbed out.
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: () => Promise.resolve(null) },
}));

vi.mock("../../reference/hooks/useReference", () => ({
  useInstitutions: () => ({ data: [] }),
  useCurrencies: () => ({ data: [{ code: "CLP", name: "Peso", numeric: "152" }] }),
}));

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <AccountCreateModal open onOpenChange={() => {}} />
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/** The card panel opens ON TOP of the account panel — a regression guard for the
 *  nested surface silently not rendering. */
describe("AccountCreateModal · nested card panel", () => {
  it("opens the card form when 'add card' is pressed (phone: window)", () => {
    renderModal();

    expect(screen.queryByLabelText(i18n.t("cards.form.last4"))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("cards.addShort") }));

    // The nested panel's own form must be in the document, not just its state.
    expect(screen.getByLabelText(i18n.t("cards.form.last4"))).toBeDefined();
    // Title AND the tile's placeholder name both read "Nueva tarjeta".
    expect(screen.getAllByText(i18n.t("cards.newTitle")).length).toBeGreaterThan(0);
  });

  it("opens the card form on a wide viewport too (drawer branch)", () => {
    // jsdom reports no match by default, which renders the phone `Window`; the
    // bug only showed on the drawer, so force that branch.
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("cards.addShort") }));

    expect(screen.getByLabelText(i18n.t("cards.form.last4"))).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("stacks the card panel ABOVE the account panel", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("cards.addShort") }));

    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    expect(dialogs).toHaveLength(2);
    // The z-index is set inline precisely so it can't depend on a stylesheet
    // being rebuilt — which is how this shipped broken once.
    const [parent, nested] = dialogs as HTMLElement[];
    expect(parent!.style.zIndex).toBe("");
    expect(Number(nested!.style.zIndex)).toBeGreaterThan(1300);
    vi.unstubAllGlobals();
  });

  it("cancelling the card panel leaves the account panel open", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("cards.addShort") }));

    const [cancel] = screen.getAllByRole("button", { name: i18n.t("common.cancel") });
    fireEvent.click(cancel!);

    // The card form is gone...
    expect(screen.queryByLabelText(i18n.t("cards.form.last4"))).toBeNull();
    // ...and the account it belongs to is still being created.
    expect(screen.getByLabelText(i18n.t("accounts.form.name"))).toBeDefined();
  });
});
