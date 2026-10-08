import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { ProfileIdentity } from "./ProfileIdentity";

const me = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: { me: (...args: unknown[]) => me(...args), logout: vi.fn() },
}));
vi.mock("../../accounts/api/accountsApi", () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]) },
}));
const summary = vi.fn();
vi.mock("../../transactions/api/transactionsApi", () => ({
  transactionsApi: { summary: (...args: unknown[]) => summary(...args) },
}));

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "ana@correo.cl",
    name: "Ana Soto",
    preferredCurrency: "CLP",
    locale: "es",
    theme: "dark",
    memberSinceYear: 2026,
    ...overrides,
  };
}

beforeEach(() => {
  me.mockResolvedValue(user());
  summary.mockResolvedValue({ total: 84, currencyTotals: [] });
});

describe("ProfileIdentity", () => {
  it("shows the name, the email, accounts, this month's movements and the year joined", async () => {
    render(
      <Providers>
        <ProfileIdentity variant="full" />
      </Providers>,
    );
    expect(await screen.findByText("Ana Soto")).toBeTruthy();
    expect(screen.getByText("ana@correo.cl")).toBeTruthy();
    expect(
      await screen.findByText(
        i18n.t("profile.identity.stats", { accounts: 3, movements: 84, year: 2026 }),
      ),
    ).toBeTruthy();
  });

  it("uses the email as the name when there is no name", async () => {
    me.mockResolvedValue(user({ name: null }));
    render(
      <Providers>
        <ProfileIdentity variant="header" />
      </Providers>,
    );
    expect(await screen.findByText("ana@correo.cl")).toBeTruthy();
    expect(screen.getAllByText("ana@correo.cl")).toHaveLength(1);
  });
});
