import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Providers } from "./providers";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("renders the brand and welcome copy via i18n", () => {
    render(
      <Providers>
        <DashboardPage />
      </Providers>,
    );
    expect(screen.getByRole("heading", { name: "FinanceApp" })).toBeDefined();
    expect(screen.getByText("Panel de finanzas personales")).toBeDefined();
  });
});
