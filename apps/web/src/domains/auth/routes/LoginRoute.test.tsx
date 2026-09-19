import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import i18n from "../../../i18n";
import { LoginRoute } from "./LoginRoute";

const login = vi.fn();
const verifyMfaLogin = vi.fn();
vi.mock("../../auth/api/authApi", () => ({
  authApi: {
    login: (...args: unknown[]) => login(...args),
    verifyMfaLogin: (...args: unknown[]) => verifyMfaLogin(...args),
    me: vi.fn().mockRejectedValue(new Error("not signed in")),
    logout: vi.fn(),
  },
}));

const startLogin = vi.fn();
const verifyLogin = vi.fn();
vi.mock("../../auth/api/passkeyApi", () => ({
  passkeyApi: {
    startLogin: (...args: unknown[]) => startLogin(...args),
    verifyLogin: (...args: unknown[]) => verifyLogin(...args),
  },
}));

const fakeOptions = {
  challenge: "Y2hhbGxlbmdl",
  rpId: "localhost",
  allowCredentials: [{ id: "Y3JlZA", type: "public-key" }],
};

const fakeAssertion = {
  id: "cred1",
  rawId: new Uint8Array([1, 2, 3]).buffer,
  type: "public-key",
  response: {
    clientDataJSON: new Uint8Array([4]).buffer,
    authenticatorData: new Uint8Array([5]).buffer,
    signature: new Uint8Array([6]).buffer,
    userHandle: null,
  },
  getClientExtensionResults: () => ({}),
};

function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Providers>
        <LoginRoute />
      </Providers>
    </MemoryRouter>,
  );
}

async function submitCredentials() {
  fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.email")), {
    target: { value: "a@b.com" },
  });
  fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.password")), {
    target: { value: "secret123" },
  });
  fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.signIn") }));
}

describe("LoginRoute", () => {
  beforeEach(() => {
    login.mockReset();
    verifyMfaLogin.mockReset();
    startLogin.mockReset();
    verifyLogin.mockReset();
  });

  it("with MFA required, shows the second step instead of navigating away", async () => {
    login.mockResolvedValue({ mfaRequired: true });
    renderLogin();

    await submitCredentials();

    expect(await screen.findByText(i18n.t("auth.mfa.title"))).toBeDefined();
    expect(screen.queryByPlaceholderText(i18n.t("auth.password"))).toBeNull();
  });

  it("an invalid MFA code shows an error and stays on the second step", async () => {
    login.mockResolvedValue({ mfaRequired: true });
    verifyMfaLogin.mockRejectedValue(new ApiRequestError("INVALID_MFA_CODE", 401));
    renderLogin();
    await submitCredentials();
    await screen.findByText(i18n.t("auth.mfa.title"));

    fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.mfa.placeholder")), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.mfa.verify") }));

    await waitFor(() => expect(screen.getByText(i18n.t("errors.INVALID_MFA_CODE"))).toBeDefined());
    expect(screen.getByText(i18n.t("auth.mfa.title"))).toBeDefined();
  });

  it("a valid MFA code completes the login", async () => {
    login.mockResolvedValue({ mfaRequired: true });
    verifyMfaLogin.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", mfaEnabled: true, mfaRecoveryCodesRemaining: 9 },
    });
    renderLogin();
    await submitCredentials();
    await screen.findByText(i18n.t("auth.mfa.title"));

    fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.mfa.placeholder")), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.mfa.verify") }));

    await waitFor(() => expect(verifyMfaLogin).toHaveBeenCalledWith({ code: "123456" }));
  });

  it("without MFA, logs in directly with no second step", async () => {
    login.mockResolvedValue({
      mfaRequired: false,
      user: { id: "u1", email: "a@b.com", mfaEnabled: false, mfaRecoveryCodesRemaining: 0 },
    });
    renderLogin();
    await submitCredentials();

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: "a@b.com", password: "secret123" }),
    );
    expect(screen.queryByText(i18n.t("auth.mfa.title"))).toBeNull();
  });

  it("passkey button works with no email typed — discoverable/usernameless login", async () => {
    vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
    startLogin.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.get as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAssertion);
    verifyLogin.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", mfaEnabled: false, mfaRecoveryCodesRemaining: 0 },
    });

    renderLogin();
    const button = screen.getByRole("button", { name: i18n.t("auth.passkey.signIn") });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(startLogin).toHaveBeenCalledWith({ email: undefined }));
    vi.unstubAllGlobals();
  });

  it("with an email typed, the passkey login narrows to that account", async () => {
    vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
    startLogin.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.get as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAssertion);
    verifyLogin.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", mfaEnabled: false, mfaRecoveryCodesRemaining: 0 },
    });

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.email")), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.passkey.signIn") }));

    await waitFor(() => expect(startLogin).toHaveBeenCalledWith({ email: "a@b.com" }));
    vi.unstubAllGlobals();
  });

  it("logging in with a passkey navigates without ever touching password/MFA", async () => {
    vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
    startLogin.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.get as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAssertion);
    verifyLogin.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", mfaEnabled: true, mfaRecoveryCodesRemaining: 5 },
    });

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.email")), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.passkey.signIn") }));

    await waitFor(() => expect(verifyLogin).toHaveBeenCalled());
    expect(login).not.toHaveBeenCalled();
    expect(verifyMfaLogin).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a rejected/cancelled passkey ceremony shows a generic error, same as a wrong password", async () => {
    vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
    startLogin.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.email")), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.passkey.signIn") }));

    await waitFor(() =>
      expect(screen.getByText(i18n.t("errors.INVALID_CREDENTIALS"))).toBeDefined(),
    );
    vi.unstubAllGlobals();
  });

  describe("conditional mediation (autofill-driven passkey suggestion)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("attempts it on mount when the browser supports it, and completes login on success", async () => {
      vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
      vi.stubGlobal("PublicKeyCredential", {
        isConditionalMediationAvailable: vi.fn().mockResolvedValue(true),
      });
      startLogin.mockResolvedValue({ options: fakeOptions });
      (navigator.credentials.get as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAssertion);
      verifyLogin.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", mfaEnabled: false, mfaRecoveryCodesRemaining: 0 },
      });

      renderLogin();

      await waitFor(() => expect(startLogin).toHaveBeenCalledWith({}));
      await waitFor(() =>
        expect(navigator.credentials.get).toHaveBeenCalledWith(
          expect.objectContaining({ mediation: "conditional" }),
        ),
      );
      await waitFor(() => expect(verifyLogin).toHaveBeenCalled());
    });

    it("does nothing and shows no error when the browser doesn't support it", async () => {
      vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
      // No `PublicKeyCredential` stubbed at all — same as every browser without WebAuthn support.

      renderLogin();
      await screen.findByPlaceholderText(i18n.t("auth.email"));

      expect(startLogin).not.toHaveBeenCalled();
      expect(navigator.credentials.get).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("the explicit button still completes login while a conditional attempt is still pending (FR-006)", async () => {
      vi.stubGlobal("navigator", { ...navigator, credentials: { get: vi.fn(), create: vi.fn() } });
      vi.stubGlobal("PublicKeyCredential", {
        // Never resolves — simulates the conditional suggestion still sitting there unanswered.
        isConditionalMediationAvailable: vi.fn(() => new Promise<boolean>(() => {})),
      });
      startLogin.mockResolvedValue({ options: fakeOptions });
      (navigator.credentials.get as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAssertion);
      verifyLogin.mockResolvedValue({
        user: { id: "u1", email: "a@b.com", mfaEnabled: false, mfaRecoveryCodesRemaining: 0 },
      });

      renderLogin();
      fireEvent.change(screen.getByPlaceholderText(i18n.t("auth.email")), {
        target: { value: "a@b.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.passkey.signIn") }));

      await waitFor(() => expect(verifyLogin).toHaveBeenCalled());
    });
  });
});
