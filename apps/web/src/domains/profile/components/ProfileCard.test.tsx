import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ProfileCard } from "./ProfileCard";

vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "javier@correo.cl",
      name: "Javier Torres",
      preferredCurrency: "CLP",
      locale: "es",
      dateFormat: "DD/MM/YYYY",
      theme: "dark",
      memberSinceYear: 2024,
    }),
    logout: vi.fn(),
  },
}));
vi.mock("../../accounts/api/accountsApi", () => ({
  accountsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../transactions/api/transactionsApi", () => ({
  transactionsApi: {
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    // The monthly movement count comes from the aggregate endpoint now.
    summary: vi.fn().mockResolvedValue({ total: 0, currencyTotals: [], categories: [] }),
  },
}));

describe("ProfileCard", () => {
  it("renders the user's initials and shows 0 stats when there is no data", async () => {
    render(
      <Providers>
        <MemoryRouter>
          <ProfileCard />
        </MemoryRouter>
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText("Javier Torres")).toBeDefined());
    expect(screen.getByText("JT")).toBeDefined();
    await waitFor(() => {
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBe(2); // accounts + monthly movements
    });
    expect(screen.getByText("2024")).toBeDefined();
  });
});
