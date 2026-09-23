import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { RegisterRoute } from "./RegisterRoute";

const register = vi.fn();
vi.mock("../api/authApi", () => ({
  authApi: {
    register: (...args: unknown[]) => register(...args),
    me: vi.fn().mockRejectedValue(new Error("not signed in")),
    logout: vi.fn(),
  },
}));

function renderRegister() {
  return render(
    <Providers>
      <MemoryRouter>
        <RegisterRoute />
      </MemoryRouter>
    </Providers>,
  );
}

function fillCommonFields() {
  fireEvent.change(screen.getByLabelText(i18n.t("auth.name")), {
    target: { value: "Ana Titular" },
  });
  fireEvent.change(screen.getByLabelText(i18n.t("auth.rut")), {
    target: { value: "12.345.678-5" },
  });
  fireEvent.change(screen.getByLabelText(i18n.t("auth.email")), {
    target: { value: "a@b.com" },
  });
  fireEvent.change(screen.getByLabelText(i18n.t("auth.password")), {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("switch", { name: i18n.t("auth.sensitiveDataConsentLabel") }));
}

describe("RegisterRoute — minor guardian authorization", () => {
  it("does not show the guardian block for an adult birthDate", () => {
    renderRegister();
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(i18n.t("auth.birthDate")), {
      target: { value: "1990-01-01" },
    });

    expect(screen.queryByText(i18n.t("auth.guardian.title"))).toBeNull();
  });

  it("shows the guardian block for a minor birthDate and includes it in the submit payload", async () => {
    register.mockResolvedValue(undefined);
    renderRegister();
    fillCommonFields();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    fireEvent.change(screen.getByLabelText(i18n.t("auth.birthDate")), {
      target: { value: tenYearsAgo.toISOString().slice(0, 10) },
    });

    expect(await screen.findByText(i18n.t("auth.guardian.title"))).toBeDefined();

    fireEvent.change(screen.getByLabelText(i18n.t("auth.guardian.name")), {
      target: { value: "Ana Madre" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.guardian.identifierValue")), {
      target: { value: "11.111.111-1" },
    });
    fireEvent.click(screen.getByRole("switch", { name: i18n.t("auth.guardian.acceptLabel") }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          guardianAuthorization: {
            name: "Ana Madre",
            identifierValue: "11.111.111-1",
            relationship: "MOTHER",
            accepted: true,
          },
        }),
      ),
    );
  });
});
