import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@finance/client";
import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { PasskeySection } from "./PasskeySection";

const startRegistration = vi.fn();
const confirmRegistration = vi.fn();
const remove = vi.fn();
const rename = vi.fn();
const list = vi.fn().mockResolvedValue([]);
const registrationSuggestion = vi.fn().mockResolvedValue({ suggestedName: null });
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  passkeyApi: {
    startRegistration: (...args: unknown[]) => startRegistration(...args),
    confirmRegistration: (...args: unknown[]) => confirmRegistration(...args),
    remove: (...args: unknown[]) => remove(...args),
    rename: (...args: unknown[]) => rename(...args),
    list: (...args: unknown[]) => list(...args),
    registrationSuggestion: (...args: unknown[]) => registrationSuggestion(...args),
  },
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      mfaEnabled: false,
      mfaRecoveryCodesRemaining: 0,
    }),
    logout: vi.fn(),
  },
}));

const fakeCredential = {
  id: "cred1",
  rawId: new Uint8Array([1, 2, 3]).buffer,
  type: "public-key",
  response: {
    clientDataJSON: new Uint8Array([4, 5]).buffer,
    attestationObject: new Uint8Array([6, 7]).buffer,
    getTransports: () => ["internal"],
  },
  getClientExtensionResults: () => ({}),
};

function renderPanel() {
  render(
    <Providers>
      <PasskeySection open onOpenChange={() => {}} />
    </Providers>,
  );
}

beforeEach(() => {
  vi.stubGlobal("navigator", {
    ...navigator,
    credentials: { create: vi.fn(), get: vi.fn() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  list.mockResolvedValue([]);
});

describe("PasskeySection", () => {
  it("shows the empty state when there are no passkeys", async () => {
    renderPanel();
    expect(await screen.findByText(i18n.t("profile.security.passkey.empty"))).toBeDefined();
  });

  it("shows registered passkeys with their dates", async () => {
    list.mockResolvedValue([
      { id: "p1", name: "MacBook", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null },
    ]);
    renderPanel();
    expect(await screen.findByText("MacBook")).toBeDefined();
    expect(screen.getByText(/nunca usada/)).toBeDefined();
  });

  const fakeOptions = {
    challenge: "Y2hhbGxlbmdl",
    rp: { id: "localhost", name: "fik" },
    user: { id: "dXNlcg", name: "a@b.com", displayName: "a@b.com" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  };

  it("adding a passkey asks for a name, then confirms it and refreshes the list", async () => {
    startRegistration.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCredential);
    confirmRegistration.mockResolvedValue({
      id: "p1",
      name: "MacBook",
      createdAt: "x",
      lastUsedAt: null,
    });

    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.passkey.add") }),
    );

    const nameInput = await screen.findByLabelText(i18n.t("profile.security.passkey.nameLabel"));
    fireEvent.change(nameInput, { target: { value: "MacBook" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.passkey.save") }));

    await waitFor(() =>
      expect(confirmRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ name: "MacBook" }),
      ),
    );
  });

  it("a cancelled device ceremony (create resolves null) adds nothing", async () => {
    startRegistration.mockResolvedValue({
      options: {
        challenge: "Y2hhbGxlbmdl",
        rp: { id: "localhost", name: "fik" },
        user: { id: "dXNlcg", name: "a@b.com", displayName: "a@b.com" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      },
    });
    (navigator.credentials.create as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.passkey.add") }),
    );

    await waitFor(() => expect(startRegistration).toHaveBeenCalled());
    expect(screen.queryByLabelText(i18n.t("profile.security.passkey.nameLabel"))).toBeNull();
    expect(confirmRegistration).not.toHaveBeenCalled();
  });

  it("removing a passkey calls the API and refreshes the list", async () => {
    list.mockResolvedValue([
      { id: "p1", name: "MacBook", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null },
    ]);
    remove.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.passkey.remove.button") }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: i18n.t("profile.security.passkey.remove.confirm"),
      }),
    );

    await waitFor(() => expect(remove).toHaveBeenCalledWith("p1"));
  });

  it("renaming a passkey calls the API with the new name and refreshes the list", async () => {
    list.mockResolvedValue([
      { id: "p1", name: "Old Name", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null },
    ]);
    rename.mockResolvedValue({
      id: "p1",
      name: "New Name",
      createdAt: "2026-01-01T00:00:00Z",
      lastUsedAt: null,
    });
    renderPanel();
    await screen.findByText("Old Name");

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.passkey.rename.button") }),
    );
    const input = screen.getByDisplayValue("Old Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.passkey.rename.save") }),
    );

    await waitFor(() => expect(rename).toHaveBeenCalledWith("p1", { name: "New Name" }));
  });

  it("cancelling a rename discards the edit without calling the API", async () => {
    list.mockResolvedValue([
      { id: "p1", name: "Old Name", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null },
    ]);
    renderPanel();
    await screen.findByText("Old Name");

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.passkey.rename.button") }),
    );
    const input = screen.getByDisplayValue("Old Name");
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.passkey.rename.cancel") }),
    );

    expect(rename).not.toHaveBeenCalled();
    expect(await screen.findByText("Old Name")).toBeDefined();
  });

  it("prefills the name with the authenticator's model, still editable (specs/041)", async () => {
    startRegistration.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCredential);
    registrationSuggestion.mockResolvedValue({ suggestedName: "YubiKey 5 NFC" });
    confirmRegistration.mockResolvedValue({
      id: "p1",
      name: "Mía",
      createdAt: "x",
      lastUsedAt: null,
    });

    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.passkey.add") }),
    );
    const nameInput = (await screen.findByLabelText(
      i18n.t("profile.security.passkey.nameLabel"),
    )) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("YubiKey 5 NFC"));
    fireEvent.change(nameInput, { target: { value: "Mía" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.passkey.save") }));
    await waitFor(() =>
      expect(confirmRegistration).toHaveBeenCalledWith(expect.objectContaining({ name: "Mía" })),
    );
  });

  it("says why a compromised model can't be registered", async () => {
    startRegistration.mockResolvedValue({ options: fakeOptions });
    (navigator.credentials.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCredential);
    confirmRegistration.mockRejectedValue(
      new ApiRequestError("PASSKEY_AUTHENTICATOR_COMPROMISED", 409),
    );
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.passkey.add") }),
    );
    fireEvent.change(await screen.findByLabelText(i18n.t("profile.security.passkey.nameLabel")), {
      target: { value: "Llave" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("profile.security.passkey.save") }));
    expect(
      await screen.findByText(i18n.t("errors.PASSKEY_AUTHENTICATOR_COMPROMISED")),
    ).toBeDefined();
  });

  it("shows each passkey's model and status", async () => {
    list.mockResolvedValue([
      {
        id: "p1",
        name: "Trabajo",
        createdAt: "2026-01-01T00:00:00Z",
        lastUsedAt: null,
        status: "verified",
        authenticatorName: "YubiKey 5 NFC",
        compromisedAt: null,
      },
      {
        id: "p2",
        name: "Vieja",
        createdAt: "2026-01-01T00:00:00Z",
        lastUsedAt: null,
        status: "compromised",
        authenticatorName: "Llave X",
        compromisedAt: "2026-11-05T00:00:00Z",
      },
      { id: "p3", name: "iPhone", createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null },
    ]);
    renderPanel();
    expect(
      await screen.findByText(i18n.t("profile.security.passkey.status.verified")),
    ).toBeDefined();
    expect(
      screen.getByText(i18n.t("profile.security.passkey.model", { model: "YubiKey 5 NFC" })),
    ).toBeDefined();
    expect(screen.getByText(i18n.t("profile.security.passkey.status.compromised"))).toBeDefined();
    expect(screen.getByText(i18n.t("profile.security.passkey.compromisedHint"))).toBeDefined();
  });

  it("adding a passkey without a recent step-up asks for one first, never the device", async () => {
    startRegistration.mockRejectedValueOnce(new ApiRequestError("STEP_UP_REQUIRED", 403));
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: i18n.t("profile.security.passkey.add") }),
    );

    expect(await screen.findByText(i18n.t("profile.security.passkey.stepUpHint"))).toBeDefined();
    expect(navigator.credentials.create).not.toHaveBeenCalled();
  });
});
