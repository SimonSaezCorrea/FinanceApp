import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getI18n } from "../../../i18n";
import { Providers, i18n } from "../../../test/providers";
import { RegisterForm } from "./RegisterForm";

const register = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    register: (...args: unknown[]) => register(...args),
    me: vi.fn().mockRejectedValue(new Error("not signed in")),
    logout: vi.fn(),
  },
}));

function renderRegister(onSwitchToLogin?: () => void) {
  return render(
    <Providers>
      <RegisterForm onSuccess={vi.fn()} onSwitchToLogin={onSwitchToLogin} />
    </Providers>,
  );
}

/** Picks a birth date the way a person does: the calendar opens on years, then month, then day. */
function pickBirthDate(value: string, t: typeof i18n = i18n) {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  fireEvent.click(screen.getByLabelText(t.t("auth.birthDate")));
  while (!screen.queryByRole("button", { name: String(year) })) {
    const shown = Number(screen.getAllByRole("button", { name: /^\d{4}$/ })[0]!.textContent);
    const label = year < shown ? "common.date.previousYears" : "common.date.nextYears";
    fireEvent.click(screen.getByLabelText(t.t(label)));
  }
  fireEvent.click(screen.getByRole("button", { name: String(year) }));
  const monthName = new Date(2024, month - 1, 1)
    .toLocaleDateString(t.language, { month: "short" })
    .replace(".", "")
    .slice(0, 3);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${monthName}$`, "i") }));
  // Days of the neighbouring months share numbers with this one's; they are the dimmed cells.
  const cell = screen
    .getAllByRole("button", { name: String(day) })
    .find((b) => !b.className.includes("text-muted-foreground/50"));
  fireEvent.click(cell!);
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fillBirthDate(value = "1990-05-20") {
  pickBirthDate(value);
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
    pickBirthDate("1990-01-01");
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
    pickBirthDate("1990-01-01");
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
    pickBirthDate("1990-01-01");
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
    pickBirthDate(localDay(tenYearsAgo));
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
    pickBirthDate("1990-01-01");

    expect(screen.queryByText(i18n.t("auth.guardian.title"))).toBeNull();
  });

  it("shows the guardian block for a minor birthDate and includes it in the submit payload", async () => {
    register.mockResolvedValue(undefined);
    renderRegister();
    fillCommonFields();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    pickBirthDate(localDay(tenYearsAgo));

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

describe("RegisterForm — submit feedback", () => {
  it("a missing consent is flagged on its own card, which gets focus", async () => {
    register.mockReset();
    renderRegister();
    fillCommonFields();
    // untick the consent fillCommonFields ticked
    const consent = screen.getByRole("checkbox", {
      name: i18n.t("auth.sensitiveDataConsentLabel"),
    });
    fireEvent.click(consent);
    fillBirthDate();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    expect(await screen.findByText(i18n.t("auth.consentRequired"))).toBeDefined();
    expect(consent.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(consent);
    expect(register).not.toHaveBeenCalled();
  });

  it("the consent checkbox is described by its full text, not only its title", () => {
    renderRegister();
    const consent = screen.getByRole("checkbox", {
      name: i18n.t("auth.sensitiveDataConsentLabel"),
    });
    const describedBy = consent.getAttribute("aria-describedby") ?? "";
    const text = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(text).toContain("Política de Privacidad");
  });

  it("an invalid field above gets focus first", async () => {
    renderRegister();
    fillCommonFields();
    fireEvent.change(screen.getByLabelText(i18n.t("auth.email")), { target: { value: "a@b" } });
    fillBirthDate();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(i18n.t("auth.email"))),
    );
  });

  it("a RUT that already has an account says so on the field and offers to sign in", async () => {
    const { ApiRequestError } = await import("@finance/client");
    register.mockReset();
    register.mockRejectedValue(new ApiRequestError("IDENTIFIER_TAKEN", 409));
    const onSwitchToLogin = vi.fn();
    renderRegister(onSwitchToLogin);
    fillCommonFields();
    fillBirthDate();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.createAccount") }));

    expect(await screen.findByText(i18n.t("auth.signup.rutTaken"), { exact: false })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("auth.signIn")) }));
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });

  it("the symbol is a recommendation outside the checklist", () => {
    renderRegister();
    const list = screen.getByRole("list", { name: i18n.t("auth.passwordRules.label") });
    expect(list.textContent).not.toMatch(/símbolo|symbol/i);
    expect(screen.getByText(i18n.t("auth.passwordRules.symbolHint"))).toBeDefined();
  });
});

describe("RegisterForm — the page's language", () => {
  it("creates the account in the language of the page it was filled on", async () => {
    register.mockReset().mockResolvedValue({ id: "u1" });
    render(
      <Providers lang="en">
        <RegisterForm onSuccess={vi.fn()} />
      </Providers>,
    );
    const en = getI18n("en");
    fireEvent.change(screen.getByLabelText(en.t("auth.name")), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(en.t("auth.rut")), {
      target: { value: "12.345.678-5" },
    });
    fireEvent.change(screen.getByLabelText(en.t("auth.email")), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(en.t("auth.password")), {
      target: { value: "password123" },
    });
    pickBirthDate("1990-01-01", en);
    fireEvent.click(screen.getByRole("checkbox", { name: en.t("auth.sensitiveDataConsentLabel") }));
    fireEvent.click(screen.getByRole("button", { name: en.t("auth.createAccount") }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0]![0]).toMatchObject({ locale: "en" });
  });

  it("links the privacy policy in the page's language", () => {
    renderRegister();
    const link = screen.getByRole("link", { name: /privacidad/i });
    expect(link.getAttribute("href")).toBe("/es/privacy-policy/");
  });
});
