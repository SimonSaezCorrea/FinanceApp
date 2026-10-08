import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import { buildTemplate } from "../lib/buildTemplate";
import { ImportRoute } from "./ImportRoute";

vi.mock("../../accounts/api/accountsApi", () => ({
  accountsApi: {
    list: vi.fn(async () => [
      {
        id: "acc-bci",
        name: "BCI",
        type: "CHECKING",
        currency: "CLP",
        institution: "BCI",
        accountNumber: "123",
        cards: [{ id: "card-1", last4: "4827" }],
      },
    ]),
  },
}));
vi.mock("../../reference/api/referenceApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../reference/api/referenceApi")>();
  return {
    referenceApi: {
      ...original.referenceApi,
      categories: () =>
        Promise.resolve([
          { id: "cat-super", code: "SUPERMARKET", kind: "EXPENSE", isSystem: false, sortOrder: 1 },
        ]),
    },
  };
});
vi.mock("../../reference/hooks/useAllowedCurrencies", () => ({
  useAllowedCurrencies: () => [{ code: "CLP", name: "Peso chileno" }],
}));
vi.mock("../lib/buildTemplate", () => ({ buildTemplate: vi.fn(async () => new Blob(["x"])) }));

function renderRoute() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ImportRoute />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("ImportRoute", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("es");
    URL.createObjectURL = vi.fn(() => "blob:template");
    URL.revokeObjectURL = vi.fn();
    // jsdom can't navigate to the download.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("offers the Cuadra template next to the statement importer's account list", async () => {
    renderRoute();
    expect(screen.getByText("Plantilla Cuadra")).toBeTruthy();
    // The statement importer still lists the accounts to import into.
    expect(await screen.findByText("BCI")).toBeTruthy();
  });

  it("downloads a template built with the user's active accounts, cards and categories", async () => {
    renderRoute();
    const button = await screen.findByRole("button", { name: "Descargar plantilla" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    // Empty is the default choice.
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Descargar" }));
    await waitFor(() => expect(buildTemplate).toHaveBeenCalled());
    const [{ refs, locale, existing }] = vi.mocked(buildTemplate).mock.calls[0]!;
    expect(existing).toBeUndefined();
    expect(locale).toBe("es");
    expect(refs.accounts).toEqual([
      { id: "acc-bci", name: "BCI", type: "CHECKING", currency: "CLP" },
    ]);
    expect(refs.cards).toEqual([
      { id: "card-1", accountId: "acc-bci", accountName: "BCI", last4: "4827" },
    ]);
    expect(refs.categories.map((c) => c.code)).toEqual(["SUPERMARKET"]);
    expect(refs.currencies).toEqual(["CLP"]);
  });
});
