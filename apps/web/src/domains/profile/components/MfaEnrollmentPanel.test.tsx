import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@finance/client";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { renderRouted } from "../testing/renderRouted";
import { MfaEnrollmentPanel } from "./MfaEnrollmentPanel";

const me = vi.fn();
const startMfaEnrollment = vi.fn();
const confirmMfaEnrollment = vi.fn();
const stepUp = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    me: (...args: unknown[]) => me(...args),
    logout: vi.fn(),
    startMfaEnrollment: (...args: unknown[]) => startMfaEnrollment(...args),
    confirmMfaEnrollment: (...args: unknown[]) => confirmMfaEnrollment(...args),
    sendStepUpEmailCode: vi.fn().mockResolvedValue({ codeSent: true }),
  },
  passkeyApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../api/sessionsApi", () => ({
  sessionsApi: { stepUp: (...args: unknown[]) => stepUp(...args), list: vi.fn() },
}));

const baseUser = {
  id: "u1",
  email: "ana@b.com",
  name: "Ana",
  mfaEnabled: false,
  mfaMethod: null,
  mfaRecoveryCodesRemaining: 0,
  emailVerified: true,
};

function renderPanel(mode: "activate" | "change" = "activate") {
  renderRouted(
    <Providers>
      <MfaEnrollmentPanel open onOpenChange={() => {}} mode={mode} />
    </Providers>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("MfaEnrollmentPanel (specs/040)", () => {
  it("offers email only with a confirmed address", async () => {
    me.mockResolvedValue({ ...baseUser, emailVerified: false });
    renderPanel();
    const email = await screen.findByRole("radio", {
      name: new RegExp(i18n.t("profile.security.mfa.methods.email.title")),
    });
    await waitFor(() => expect((email as HTMLButtonElement).disabled).toBe(true));
    expect(
      screen.getByText(i18n.t("profile.security.mfa.methods.email.needsVerified")),
    ).toBeDefined();
  });

  it("activates by email: sends the code, then confirms it and shows the recovery codes", async () => {
    me.mockResolvedValue(baseUser);
    startMfaEnrollment.mockResolvedValue({ method: "email", codeSent: true });
    confirmMfaEnrollment.mockResolvedValue({ recoveryCodes: ["AAAA-1111"] });
    renderPanel();

    const email = await screen.findByRole("radio", {
      name: new RegExp(i18n.t("profile.security.mfa.methods.email.title")),
    });
    await waitFor(() => expect((email as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(email);
    expect(screen.getByText(i18n.t("profile.security.mfa.methods.email.lessSecure"))).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.mfa.continue") }));

    await waitFor(() => expect(startMfaEnrollment).toHaveBeenCalledWith({ method: "email" }));
    expect(
      await screen.findByText(i18n.t("profile.security.mfa.emailSentTo", { email: "ana@b.com" })),
    ).toBeDefined();
    fireEvent.change(screen.getByLabelText(i18n.t("profile.security.mfa.codeLabel")), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.mfa.confirm") }));
    expect(await screen.findByText("AAAA-1111")).toBeDefined();
  });

  it("a method change asks for a step-up first, then switches to the other method", async () => {
    me.mockResolvedValue({ ...baseUser, mfaEnabled: true, mfaMethod: "totp" });
    startMfaEnrollment
      .mockRejectedValueOnce(new ApiRequestError("STEP_UP_REQUIRED", 403))
      .mockResolvedValue({ method: "email", codeSent: true });
    renderPanel("change");

    expect(await screen.findByText(i18n.t("profile.security.mfa.change.stepUpHint"))).toBeDefined();
    await waitFor(() => expect(startMfaEnrollment).toHaveBeenCalledWith({ method: "email" }));
  });
});
