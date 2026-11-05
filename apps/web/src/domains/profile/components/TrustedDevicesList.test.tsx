import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Providers } from "../../../app/providers";
import i18n from "../../../i18n";
import { TrustedDevicesList } from "./TrustedDevicesList";

const listTrustedDevices = vi.fn();
const removeTrustedDevice = vi.fn();
vi.mock("@finance/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@finance/client")>()),
  authApi: {
    me: vi.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      mfaEnabled: true,
      mfaRecoveryCodesRemaining: 10,
    }),
    logout: vi.fn(),
    listTrustedDevices: (...args: unknown[]) => listTrustedDevices(...args),
    removeTrustedDevice: (...args: unknown[]) => removeTrustedDevice(...args),
  },
}));

function renderList() {
  render(
    <Providers>
      <TrustedDevicesList />
    </Providers>,
  );
}

const device = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  deviceLabel: "Chrome · Windows",
  createdAt: "2026-11-01T12:00:00Z",
  expiresAt: "2026-12-01T12:00:00Z",
  lastUsedAt: null,
  isCurrent: false,
  ...over,
});

afterEach(() => vi.clearAllMocks());

describe("TrustedDevicesList (specs/040)", () => {
  it("says so when no device is remembered", async () => {
    listTrustedDevices.mockResolvedValue({ items: [] });
    renderList();
    expect(await screen.findByText(i18n.t("profile.security.mfa.devices.empty"))).toBeDefined();
  });

  it("marks this browser's own device", async () => {
    listTrustedDevices.mockResolvedValue({
      items: [device({ isCurrent: true }), device({ id: "d2", deviceLabel: "Safari · iOS" })],
    });
    renderList();
    expect(await screen.findByText("Safari · iOS")).toBeDefined();
    expect(screen.getAllByText(i18n.t("profile.security.mfa.devices.current"))).toHaveLength(1);
  });

  it("forgets a device after confirming", async () => {
    listTrustedDevices.mockResolvedValue({ items: [device()] });
    removeTrustedDevice.mockResolvedValue(undefined);
    renderList();
    await screen.findByText("Chrome · Windows");

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.mfa.devices.remove") }),
    );
    await screen.findByText(i18n.t("profile.security.mfa.devices.removeTitle"));
    // The modal hides the row behind it, so its own "Quitar" is the only one left to press.
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.security.mfa.devices.remove") }),
    );

    await waitFor(() => expect(removeTrustedDevice).toHaveBeenCalledWith("d1"));
  });
});
