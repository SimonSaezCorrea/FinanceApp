import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { movementTemplates } from "@finance/contracts";

import i18n from "../../../i18n";
import { AuthProvider } from "../../auth/hooks/useAuth";
import { movementTemplatesApi } from "../api/movementTemplatesApi";
import { TemplatesRoute } from "./TemplatesRoute";

vi.mock("../api/movementTemplatesApi", () => ({
  movementTemplatesApi: { list: vi.fn(), create: vi.fn(), replace: vi.fn(), remove: vi.fn() },
}));
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: { me: vi.fn().mockRejectedValue(new Error("not signed in")), logout: vi.fn() },
}));
vi.mock("../../accounts/hooks/useAccounts", () => ({
  useAccounts: () => ({
    data: [{ id: "a1", name: "Corriente", type: "CHECKING", status: "ACTIVE", cards: [] }],
  }),
  useCreditStatements: () => ({ data: [] }),
  useAccountMutations: () => ({ prepayCreditStatement: { mutate: vi.fn(), isPending: false } }),
}));

const api = vi.mocked(movementTemplatesApi);

const template = (over: Partial<movementTemplates.MovementTemplate>) =>
  ({
    id: "019a0000-0000-7000-8000-0000000000t1",
    name: "Bencina",
    type: "EXPENSE",
    amount: null,
    currency: null,
    bankAccountId: "a1",
    cardId: null,
    categoryId: null,
    recurringExpenseId: null,
    description: null,
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    financeCharge: false,
    customFields: {},
    ...over,
  }) as movementTemplates.MovementTemplate;

function renderRoute(path = "/templates") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <TemplatesRoute />
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("TemplatesRoute (specs/037)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("es");
  });

  it("explains what a template is for when there are none", async () => {
    api.list.mockResolvedValue([]);
    renderRoute();
    expect(await screen.findByText(i18n.t("templates.empty.title"))).toBeTruthy();
  });

  it("lists each template with its account and its amount, or 'monto libre'", async () => {
    api.list.mockResolvedValue([
      template({
        id: "019a0000-0000-7000-8000-0000000000a1",
        name: "Arriendo mensual",
        amount: "450000",
        currency: "CLP",
      }),
      template({}),
    ]);
    renderRoute();
    expect(await screen.findByText("Arriendo mensual")).toBeTruthy();
    expect(screen.getByText("−$450.000")).toBeTruthy();
    expect(screen.getByText(i18n.t("templates.freeAmount"))).toBeTruthy();
    expect(screen.getAllByText("Gasto · Corriente").length).toBe(2);
    expect(screen.getByText(i18n.t("templates.limit", { count: 2, max: 50 }))).toBeTruthy();
  });

  it("opens a template as its own screen with the movement it records", async () => {
    api.list.mockResolvedValue([template({ amount: "30000", currency: "CLP", lugar: "Copec" })]);
    renderRoute();
    fireEvent.click(await screen.findByRole("link", { name: /Bencina/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "Bencina" })).toBeTruthy();
    const preview = screen.getByRole("region", { name: i18n.t("templates.preview.label") });
    expect(preview.textContent).toContain("−$30.000");
    expect(preview.textContent).toContain("Copec");
    expect(screen.getByRole("button", { name: i18n.t("templates.use") })).toBeTruthy();
    expect(screen.getByRole("link", { name: i18n.t("templates.back") })).toBeTruthy();
  });

  it("deletes a template after confirming", async () => {
    api.list.mockResolvedValue([template({})]);
    api.remove.mockResolvedValue(undefined);
    renderRoute("/templates?plantilla=019a0000-0000-7000-8000-0000000000t1");
    fireEvent.click(
      await screen.findByRole("button", {
        name: i18n.t("templates.deleteNamed", { name: "Bencina" }),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("templates.delete.confirm") }),
    );
    await waitFor(() => expect(api.remove).toHaveBeenCalled());
    expect(api.remove.mock.calls[0]![0]).toBe("019a0000-0000-7000-8000-0000000000t1");
  });

  it("creates a template from the form, with its name", async () => {
    api.list.mockResolvedValue([]);
    api.create.mockResolvedValue(template({}));
    renderRoute();
    fireEvent.click(await screen.findByRole("button", { name: i18n.t("templates.empty.create") }));
    fireEvent.change(await screen.findByLabelText(i18n.t("templates.form.name")), {
      target: { value: "Bencina" },
    });
    // The preview on top shows the movement as it'll look: titled by the name, no fixed amount.
    const preview = screen.getByRole("region", { name: i18n.t("templates.preview.label") });
    expect(preview.textContent).toContain("Bencina");
    expect(preview.textContent).toContain(i18n.t("templates.freeAmount"));
    expect(screen.getByText("7/60")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("templates.form.submit") }));
    await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    expect(api.create.mock.calls[0]![0]).toMatchObject({ name: "Bencina", type: "EXPENSE" });
  });
});
