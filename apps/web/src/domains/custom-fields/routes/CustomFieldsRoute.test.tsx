import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { customFields } from "@finance/contracts";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { customFieldsApi } from "../api/customFieldsApi";
import { CustomFieldsRoute } from "./CustomFieldsRoute";

vi.mock("../api/customFieldsApi", () => ({
  customFieldsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    scopeCount: vi.fn(),
    summary: vi.fn(),
  },
}));
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: { me: vi.fn().mockRejectedValue(new Error("not signed in")), logout: vi.fn() },
}));
vi.mock("../../accounts/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: [] }),
}));

const api = vi.mocked(customFieldsApi);

const transferido: customFields.CustomField = {
  id: "019a0000-0000-7000-8000-0000000000f1",
  name: "Transferido",
  type: "BOOLEAN",
  options: [],
  scope: { movementKinds: ["EXPENSE"], accountIds: [], cardKinds: ["CREDIT"] },
  scopeBroken: false,
  defaultValue: false,
  showAsColumn: true,
  sortOrder: 0,
  valueCount: 15,
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <MemoryRouter>
            <CustomFieldsRoute />
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("CustomFieldsRoute (specs/036)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("es");
  });

  it("explains what a field is for when there are none", async () => {
    api.list.mockResolvedValue([]);
    renderRoute();
    expect(await screen.findByText(i18n.t("customFields.empty.title"))).toBeTruthy();
  });

  it("opens the form already filled from an example", async () => {
    api.list.mockResolvedValue([]);
    api.scopeCount.mockResolvedValue({ count: 0 });
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: /^Quién pagó/ }));
    const name = await screen.findByLabelText(i18n.t("customFields.form.name"));
    expect((name as HTMLInputElement).value).toBe("Quién pagó");
    expect(screen.getByDisplayValue("Pareja")).toBeTruthy();
  });

  it("shows each field's summary per value, each linked to Movimientos filtered by it", async () => {
    api.list.mockResolvedValue([transferido]);
    api.summary.mockResolvedValue({
      buckets: [
        {
          key: "true",
          total: 3,
          currencyTotals: [{ currency: "CLP", income: "0", expense: "9000" }],
        },
        {
          key: "false",
          total: 12,
          currencyTotals: [{ currency: "CLP", income: "0", expense: "184500" }],
        },
        { key: "empty", total: 2, currencyTotals: [] },
      ],
    });
    renderRoute();
    // Narrow (jsdom measures nothing): the list is the screen; a column opens on its own.
    fireEvent.click(await screen.findByRole("link", { name: /Transferido/ }));
    expect(await screen.findByRole("heading", { name: "Transferido" })).toBeTruthy();
    expect(
      screen.getByText(/Gastos con tarjeta de crédito, en todas las cuentas\. Nace en «No»\./),
    ).toBeTruthy();
    const no = await screen.findByRole("link", { name: /^No: 12 movimientos/ });
    expect(no.getAttribute("href")).toBe(`/transactions?cf=${transferido.id}&cfv=false`);
    expect(screen.getByRole("link", { name: /Sin valor/ }).getAttribute("href")).toBe(
      `/transactions?cf=${transferido.id}&cfEmpty=true`,
    );
    // What is still "No" can be transferred: Movimientos opens already selecting them.
    expect(
      screen.getByRole("link", { name: i18n.t("customFields.cover.action") }).getAttribute("href"),
    ).toBe(`/transactions?cf=${transferido.id}&cfv=false&transferir=1`);
    fireEvent.click(screen.getByRole("link", { name: i18n.t("customFields.back") }));
    expect(
      await screen.findByRole("navigation", { name: i18n.t("customFields.listLabel") }),
    ).toBeTruthy();
  });

  it("says how many values deleting a field erases", async () => {
    api.list.mockResolvedValue([transferido]);
    api.summary.mockResolvedValue({ buckets: [] });
    api.remove.mockResolvedValue(undefined);
    renderRoute();
    fireEvent.click(await screen.findByRole("link", { name: /Transferido/ }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: `${i18n.t("customFields.delete.confirm")}: Transferido`,
      }),
    );
    expect(
      await screen.findByText(i18n.t("customFields.delete.description", { count: 15 })),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.delete.confirm") }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(transferido.id));
  });

  it("creates a field with its scope and offers the existing movements the default", async () => {
    api.list.mockResolvedValue([]);
    api.scopeCount.mockResolvedValue({ count: 40 });
    api.create.mockResolvedValue(transferido);
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("customFields.new") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("customFields.form.name")), {
      target: { value: "Transferido" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.kind.EXPENSE") }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.cardKind.CREDIT") }));
    // The default is "No".
    fireEvent.click(screen.getByRole("button", { name: i18n.t("customFields.values.no") }));
    const apply = await screen.findByRole("switch", {
      name: i18n.t("customFields.form.applyExisting", { count: 40 }),
    });
    fireEvent.click(apply);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.create") }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Transferido",
          type: "BOOLEAN",
          scope: { movementKinds: ["EXPENSE"], accountIds: [], cardKinds: ["CREDIT"] },
          defaultValue: false,
          applyDefaultToExisting: true,
        }),
      ),
    );
  });
});
