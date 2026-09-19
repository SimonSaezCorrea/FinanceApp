import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { PasskeySection } from "./PasskeySection";

const startRegistration = vi.fn();
const confirmRegistration = vi.fn();
const remove = vi.fn();
const list = vi.fn().mockResolvedValue([]);
vi.mock("../../auth/api/passkeyApi", () => ({
  passkeyApi: {
    startRegistration: (...args: unknown[]) => startRegistration(...args),
    confirmRegistration: (...args: unknown[]) => confirmRegistration(...args),
    remove: (...args: unknown[]) => remove(...args),
    list: (...args: unknown[]) => list(...args),
  },
}));
vi.mock("../../auth/api/authApi", () => ({
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
    rp: { id: "localhost", name: "FinanceApp" },
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
        rp: { id: "localhost", name: "FinanceApp" },
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
});
