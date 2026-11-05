import { describe, expect, it } from "vitest";

import {
  trustedDeviceExpiry,
  trustedDeviceIsValidFor,
} from "../../../../../src/domains/trusted-device/domain/trusted-device.entity";

const DAY = 24 * 60 * 60 * 1000;

describe("trusted device (specs/040)", () => {
  it("expires exactly 30 days after it was remembered", () => {
    const created = new Date("2026-11-05T12:00:00.000Z");
    expect(trustedDeviceExpiry(created).getTime() - created.getTime()).toBe(30 * DAY);
  });

  it("is valid only for its own account and only before it expires", () => {
    const now = new Date("2026-11-05T12:00:00.000Z");
    const device = { userId: "u1", expiresAt: new Date(now.getTime() + 1000) };
    expect(trustedDeviceIsValidFor(device, "u1", now)).toBe(true);
    expect(trustedDeviceIsValidFor(device, "u2", now)).toBe(false);
    expect(trustedDeviceIsValidFor({ ...device, expiresAt: now }, "u1", now)).toBe(false);
  });
});
