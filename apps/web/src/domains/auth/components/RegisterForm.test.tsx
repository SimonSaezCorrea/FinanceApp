import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { RegisterForm } from "./RegisterForm";

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
        <RegisterForm onSuccess={vi.fn()} />
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
  fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("auth.sensitiveDataConsentLabel") }));
}

describe("RegisterForm — field validation", () => {
  it("flags a malformed email and a short password before submitting", async () => {
    register.mockReset();
    renderRegister();
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(i18n.t("auth.email")), { target: { value: "a@b" } });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.password")), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.birthDate")), {
      target: { value: "1990-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    expect(await screen.findByText(i18n.t("auth.validation.email"))).toBeDefined();
    expect(screen.getByText(i18n.t("auth.validation.passwordLength", { min: 8 }))).toBeDefined();
    expect(register).not.toHaveBeenCalled();
  });

  it("a password made of the RUT's digits is rejected even though it's long enough", async () => {
    register.mockReset();
    renderRegister();
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(i18n.t("auth.password")), {
      target: { value: "a12345678" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.birthDate")), {
      target: { value: "1990-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    expect(await screen.findByText(i18n.t("auth.validation.passwordIsRut"))).toBeDefined();
    expect(register).not.toHaveBeenCalled();
  });

  it("a password without a number is rejected", async () => {
    register.mockReset();
    renderRegister();
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(i18n.t("auth.password")), {
      target: { value: "solamente-letras" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.birthDate")), {
      target: { value: "1990-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    expect(await screen.findByText(i18n.t("auth.validation.passwordLetterNumber"))).toBeDefined();
    expect(register).not.toHaveBeenCalled();
  });

  it("an invalid guardian RUT blocks a minor's registration", async () => {
    register.mockReset();
    renderRegister();
    fillCommonFields();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    fireEvent.change(screen.getByLabelText(i18n.t("auth.birthDate")), {
      target: { value: tenYearsAgo.toISOString().slice(0, 10) },
    });
    fireEvent.change(await screen.findByLabelText(i18n.t("auth.guardian.name")), {
      target: { value: "Ana Madre" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth.guardian.identifierValue")), {
      target: { value: "11.111.111-2" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("auth.guardian.acceptLabel") }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    expect(await screen.findByText(i18n.t("auth.validation.rut"))).toBeDefined();
    expect(register).not.toHaveBeenCalled();
  });
});

describe("RegisterForm — minor guardian authorization", () => {
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
    fireEvent.click(screen.getByRole("checkbox", { name: i18n.t("auth.guardian.acceptLabel") }));
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
