import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "../../../i18n";
import { PrivacyPolicyRoute } from "./PrivacyPolicyRoute";

function renderRoute() {
  return render(
    <MemoryRouter>
      <PrivacyPolicyRoute />
    </MemoryRouter>,
  );
}

describe("PrivacyPolicyRoute", () => {
  afterEach(() => void i18n.changeLanguage("es"));

  it("renders the published policy text in Spanish", () => {
    renderRoute();
    expect(screen.getByRole("heading", { level: 1, name: "Política de privacidad" })).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 2, name: "1. Responsable del tratamiento" }),
    ).toBeDefined();
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Ver en mifik.cl" }).getAttribute("href")).toMatch(
      /\/es\/privacy-policy\/$/,
    );
  });

  it("switches to the English translation", async () => {
    await i18n.changeLanguage("en");
    renderRoute();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeDefined();
    expect(screen.getByRole("link", { name: "View on mifik.cl" }).getAttribute("href")).toMatch(
      /\/en\/privacy-policy\/$/,
    );
  });
});
