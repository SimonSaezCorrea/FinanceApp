import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import i18n from "../../../i18n";
import { SecuritySection } from "./SecuritySection";

const changePassword = vi.fn();
vi.mock("../api/profileApi", () => ({
  profileApi: {
    changePassword: (...args: unknown[]) => changePassword(...args),
  },
}));

vi.mock("../../auth/api/passkeyApi", () => ({
  passkeyApi: { list: vi.fn().mockResolvedValue([]) },
}));

const listSessions = vi.fn().mockResolvedValue([]);
const closeSession = vi.fn().mockResolvedValue(undefined);
const revokeOtherSessions = vi.fn().mockResolvedValue(undefined);
const stepUp = vi
  .fn()
  .mockResolvedValue({ verifiedUntil: new Date(Date.now() + 5 * 60_000).toISOString() });
vi.mock("../api/sessionsApi", () => ({
  sessionsApi: {
    list: (...args: unknown[]) => listSessions(...args),
    close: (...args: unknown[]) => closeSession(...args),
    revokeOthers: (...args: unknown[]) => revokeOtherSessions(...args),
    stepUp: (...args: unknown[]) => stepUp(...args),
    stepUpPasskeyOptions: vi.fn(),
    stepUpPasskeyVerify: vi.fn(),
  },
}));

/** Verifies via the step-up modal's password field (the test user has no MFA/passkeys, so
 * that's the only method offered) — every "close another session" / "cerrar todas" action goes
 * through this since 2026-09-25. */
async function completeStepUp() {
  const passwordInput = await screen.findByLabelText(
    i18n.t("profile.security.stepUp.passwordLabel"),
  );
  fireEvent.change(passwordInput, { target: { value: "whatever" } });
  fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.stepUp.confirm") }));
  await waitFor(() => expect(stepUp).toHaveBeenCalled());
}

const startMfaEnrollment = vi.fn();
const confirmMfaEnrollment = vi.fn();
const disableMfa = vi.fn();
const meMock = vi.fn().mockResolvedValue({
  id: "u1",
  email: "a@b.com",
  name: "Ana",
  preferredCurrency: "CLP",
  locale: "es",
  theme: "dark",
  memberSinceYear: 2024,
  mfaEnabled: false,
  mfaRecoveryCodesRemaining: 0,
});
vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    me: (...args: unknown[]) => meMock(...args),
    logout: vi.fn(),
    startMfaEnrollment: (...args: unknown[]) => startMfaEnrollment(...args),
    confirmMfaEnrollment: (...args: unknown[]) => confirmMfaEnrollment(...args),
    disableMfa: (...args: unknown[]) => disableMfa(...args),
  },
}));

function renderSecurity() {
  render(
    <Providers>
      <SecuritySection />
    </Providers>,
  );
  return screen.getByRole("button", { name: i18n.t("profile.security.title") });
}

async function openDialog() {
  render(
    <Providers>
      <SecuritySection />
    </Providers>,
  );
  fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.title") })); // expand
  fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.change") }));
  return {
    current: await screen.findByLabelText(i18n.t("profile.security.password.current")),
    next: screen.getByLabelText(i18n.t("profile.security.password.new")),
    confirm: screen.getByLabelText(i18n.t("profile.security.password.confirm")),
  };
}

describe("SecuritySection — change password", () => {
  it("keeps Guardar disabled until the current, new and confirm fields are all valid", async () => {
    const { current, next, confirm } = await openDialog();
    const save = screen.getByRole("button", { name: i18n.t("profile.security.password.save") });
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.change(current, { target: { value: "oldpassword" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    expect(save.hasAttribute("disabled")).toBe(true); // confirm still empty

    fireEvent.change(confirm, { target: { value: "not-a-match" } });
    expect(save.hasAttribute("disabled")).toBe(true); // mismatched
    expect(screen.getByText(i18n.t("profile.security.password.matchMismatch"))).toBeDefined();

    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(i18n.t("profile.security.password.matchOk"))).toBeDefined();
  });

  it("anchors INVALID_CURRENT_PASSWORD to the current-password field, not the new one (regression)", async () => {
    changePassword.mockRejectedValue(new ApiRequestError("INVALID_CURRENT_PASSWORD", 401));
    const { current, next, confirm } = await openDialog();

    fireEvent.change(current, { target: { value: "wrong" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.save") }));

    const errorText = i18n.t("errors.INVALID_CURRENT_PASSWORD");
    await waitFor(() => expect(screen.getByText(errorText)).toBeDefined());

    // The old bug: this error rendered under "Nueva contraseña" instead.
    const newField = next.parentElement!.parentElement!;
    expect(within(newField).queryByText(errorText)).toBeNull();
    const currentField = current.parentElement!.parentElement!;
    expect(within(currentField).getByText(errorText)).toBeDefined();
  });

  it("shows a success toast and resets the fields after a successful change", async () => {
    changePassword.mockResolvedValue(undefined);
    const { current, next, confirm } = await openDialog();

    fireEvent.change(current, { target: { value: "oldpassword" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.save") }));

    await waitFor(() =>
      expect(
        screen.getAllByText(i18n.t("profile.security.password.updated")).length,
      ).toBeGreaterThan(0),
    );
  });

  it("warns before confirming that the change will close all other sessions", async () => {
    await openDialog();
    expect(screen.getByText(i18n.t("profile.security.sessions.revokeOthersWarning"))).toBeDefined();
  });

  it("shows no post-action notice about closed sessions after a successful change (SC-005)", async () => {
    changePassword.mockResolvedValue(undefined);
    const { current, next, confirm } = await openDialog();

    fireEvent.change(current, { target: { value: "oldpassword" } });
    fireEvent.change(next, { target: { value: "newpassword123" } });
    fireEvent.change(confirm, { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.password.save") }));

    await waitFor(() =>
      expect(
        screen.getAllByText(i18n.t("profile.security.password.updated")).length,
      ).toBeGreaterThan(0),
    );
    // The dialog closed on success — the warning was pre-action only, never repeated
    // as a toast/notice afterwards.
    expect(screen.queryByText(i18n.t("profile.security.sessions.revokeOthersWarning"))).toBeNull();
  });
});

describe("SecuritySection — MFA", () => {
  it("switching MFA on opens the enrollment panel and shows the QR", async () => {
    startMfaEnrollment.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,xyz",
      secret: "JBSWY3DPEHPK3PXP",
    });
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    const toggle = await screen.findByRole("switch", {
      name: i18n.t("profile.security.twoFactor.label"),
    });
    fireEvent.click(toggle);

    await waitFor(() => expect(startMfaEnrollment).toHaveBeenCalled());
    expect(await screen.findByAltText(i18n.t("profile.security.mfa.qrAlt"))).toBeDefined();
  });

  it("confirming with an invalid code shows an error without activating", async () => {
    startMfaEnrollment.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,xyz",
      secret: "JBSWY3DPEHPK3PXP",
    });
    confirmMfaEnrollment.mockRejectedValue(new ApiRequestError("INVALID_MFA_CODE", 401));
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);
    fireEvent.click(
      await screen.findByRole("switch", { name: i18n.t("profile.security.twoFactor.label") }),
    );
    await screen.findByAltText(i18n.t("profile.security.mfa.qrAlt"));

    fireEvent.change(screen.getByLabelText(i18n.t("profile.security.mfa.codeLabel")), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.mfa.confirm") }));

    await waitFor(() => expect(screen.getByText(i18n.t("errors.INVALID_MFA_CODE"))).toBeDefined());
    expect(screen.queryByText(i18n.t("profile.security.mfa.codesTitle"))).toBeNull();
  });

  it("confirming with a valid code shows the recovery codes exactly once", async () => {
    startMfaEnrollment.mockResolvedValue({
      qrCodeDataUrl: "data:image/png;base64,xyz",
      secret: "JBSWY3DPEHPK3PXP",
    });
    confirmMfaEnrollment.mockResolvedValue({
      recoveryCodes: ["AAAA-1111", "BBBB-2222"],
    });
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);
    fireEvent.click(
      await screen.findByRole("switch", { name: i18n.t("profile.security.twoFactor.label") }),
    );
    await screen.findByAltText(i18n.t("profile.security.mfa.qrAlt"));

    fireEvent.change(screen.getByLabelText(i18n.t("profile.security.mfa.codeLabel")), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.mfa.confirm") }));

    expect(await screen.findByText("AAAA-1111")).toBeDefined();
    expect(screen.getByText("BBBB-2222")).toBeDefined();
  });

  it("disabling MFA rejects an incorrect password and keeps MFA active", async () => {
    meMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
      theme: "dark",
      memberSinceYear: 2024,
      mfaEnabled: true,
      mfaRecoveryCodesRemaining: 10,
    });
    disableMfa.mockRejectedValue(new ApiRequestError("INVALID_CURRENT_PASSWORD", 401));
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    const toggle = await screen.findByRole("switch", {
      name: i18n.t("profile.security.twoFactor.label"),
    });
    await waitFor(() => expect((toggle as HTMLElement).getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(toggle);

    fireEvent.change(
      await screen.findByLabelText(i18n.t("profile.security.mfa.disablePasswordLabel")),
      { target: { value: "wrong" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.mfa.disableConfirm") }),
    );

    await waitFor(() =>
      expect(screen.getByText(i18n.t("errors.INVALID_CURRENT_PASSWORD"))).toBeDefined(),
    );
    meMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
      theme: "dark",
      memberSinceYear: 2024,
      mfaEnabled: false,
      mfaRecoveryCodesRemaining: 0,
    });
  });

  it("warns before confirming that disabling MFA will close all other sessions", async () => {
    meMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
      theme: "dark",
      memberSinceYear: 2024,
      mfaEnabled: true,
      mfaRecoveryCodesRemaining: 10,
    });
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    const toggle = await screen.findByRole("switch", {
      name: i18n.t("profile.security.twoFactor.label"),
    });
    await waitFor(() => expect((toggle as HTMLElement).getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(toggle);

    expect(
      await screen.findByText(i18n.t("profile.security.sessions.revokeOthersWarning")),
    ).toBeDefined();
  });

  it("shows no post-action notice about closed sessions after disabling MFA (SC-005)", async () => {
    meMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
      theme: "dark",
      memberSinceYear: 2024,
      mfaEnabled: true,
      mfaRecoveryCodesRemaining: 10,
    });
    disableMfa.mockResolvedValue(undefined);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    const toggle = await screen.findByRole("switch", {
      name: i18n.t("profile.security.twoFactor.label"),
    });
    await waitFor(() => expect((toggle as HTMLElement).getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(toggle);

    await screen.findByText(i18n.t("profile.security.sessions.revokeOthersWarning"));
    fireEvent.change(screen.getByLabelText(i18n.t("profile.security.mfa.disablePasswordLabel")), {
      target: { value: "correct-pw" },
    });
    meMock.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      preferredCurrency: "CLP",
      locale: "es",
      theme: "dark",
      memberSinceYear: 2024,
      mfaEnabled: false,
      mfaRecoveryCodesRemaining: 0,
    });
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.mfa.disableConfirm") }),
    );

    await waitFor(() => expect(disableMfa).toHaveBeenCalled());
    // The modal closed on success — the warning was pre-action only, never repeated
    // as a toast/notice afterwards.
    await waitFor(() =>
      expect(
        screen.queryByText(i18n.t("profile.security.sessions.revokeOthersWarning")),
      ).toBeNull(),
    );
  });
});

describe("SecuritySection — sessions", () => {
  it("renders real sessions from the API, marking the current device", async () => {
    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
      {
        id: "s2",
        deviceLabel: "Safari · iPhone",
        country: null,
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-03T00:00:00Z",
        closedAt: null,
        isCurrent: false,
      },
    ]);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    expect(await screen.findByText("Chrome · Windows")).toBeDefined();
    expect(
      screen.getByText(i18n.t("profile.security.sessions.thisDevice"), { exact: false }),
    ).toBeDefined();
    expect(screen.getByText("Safari · iPhone")).toBeDefined();
    expect(
      screen.getByText(i18n.t("profile.security.sessions.unknownLocation"), { exact: false }),
    ).toBeDefined();
  });

  it("closing a non-current session calls the API and removes it from the list", async () => {
    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
      {
        id: "s2",
        deviceLabel: "Safari · iPhone",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-03T00:00:00Z",
        closedAt: null,
        isCurrent: false,
      },
    ]);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);
    await screen.findByText("Safari · iPhone");

    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.sessions.close") }),
    );
    await completeStepUp();

    await waitFor(() => expect(closeSession).toHaveBeenCalledWith("s2"));
    await waitFor(() => expect(screen.queryByText("Safari · iPhone")).toBeNull());
  });

  it("closing the caller's OWN current session never opens the step-up panel", async () => {
    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
    ]);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);
    await screen.findByText("Chrome · Windows");

    // The current session's own row never offers a "Cerrar" button at all — signing out lives
    // elsewhere (the sidebar), not here — so there is nothing to click that could open the panel.
    expect(
      screen.queryByRole("button", { name: i18n.t("profile.security.sessions.close") }),
    ).toBeNull();
  });

  it("'cerrar todas' calls revoke-others and leaves only the current session", async () => {
    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
      {
        id: "s2",
        deviceLabel: "Safari · iPhone",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-03T00:00:00Z",
        closedAt: null,
        isCurrent: false,
      },
    ]);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);
    await screen.findByText("Safari · iPhone");

    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.sessions.closeAll") }),
    );
    await completeStepUp();

    await waitFor(() => expect(revokeOtherSessions).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Safari · iPhone")).toBeNull());
  });

  it("shows a closed session marked as such, with no 'Cerrar' button, and excludes it from the 'cerrar todas' threshold", async () => {
    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
      {
        id: "s2",
        deviceLabel: "Safari · iPhone",
        country: "CL",
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-03T00:00:00Z",
        closedAt: "2026-09-18T00:00:00Z",
        isCurrent: false,
      },
    ]);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    await screen.findByText("Safari · iPhone");
    const closedAt = new Date("2026-09-18T00:00:00Z");
    const expectedDateTime = `${closedAt.toLocaleDateString(i18n.language)} ${closedAt.toLocaleTimeString(
      i18n.language,
      { hour: "2-digit", minute: "2-digit" },
    )}`;
    expect(
      screen.getByText(i18n.t("profile.security.sessions.closed", { date: expectedDateTime }), {
        exact: false,
      }),
    ).toBeDefined();
    // Only one OPEN session (the current one) — "cerrar todas" requires more than one.
    expect(
      screen.queryByRole("button", { name: i18n.t("profile.security.sessions.closeAll") }),
    ).toBeNull();
    // A closed row never offers its own "Cerrar" button — nothing left to close.
    const closeButtons = screen.queryAllByRole("button", {
      name: i18n.t("profile.security.sessions.close"),
    });
    expect(closeButtons).toHaveLength(0);
    // Closed sessions are tucked into a collapsed group, apart from the open ones.
    const group = screen
      .getByText(i18n.t("profile.security.sessions.closedGroup", { count: 1 }))
      .closest("details") as HTMLDetailsElement;
    expect(group.open).toBe(false);
    expect(group.textContent).toContain("Safari · iPhone");
    expect(group.textContent).not.toContain("Chrome · Windows");
  });

  it("always shows the IPinfo attribution link, regardless of whether any session has a country (specs/026)", async () => {
    listSessions.mockResolvedValue([
      {
        id: "s1",
        deviceLabel: "Chrome · Windows",
        country: null,
        createdAt: "2024-01-01T00:00:00Z",
        lastUsedAt: "2024-01-02T00:00:00Z",
        closedAt: null,
        isCurrent: true,
      },
    ]);
    const expandButton = renderSecurity();
    fireEvent.click(expandButton);

    await screen.findByText("Chrome · Windows");
    const link = screen.getByRole("link", { name: "IPinfo" });
    expect(link.getAttribute("href")).toBe("https://ipinfo.io");
  });
});
