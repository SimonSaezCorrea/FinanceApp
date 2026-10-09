import { afterEach, describe, expect, it } from "vitest";

import { isPasskeySupported } from "./webauthn";

const original = (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;

afterEach(() => {
  (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = original;
});

describe("isPasskeySupported", () => {
  it("is true when the browser exposes PublicKeyCredential", () => {
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
    expect(isPasskeySupported()).toBe(true);
  });

  it("is false when the browser has no WebAuthn at all", () => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    expect(isPasskeySupported()).toBe(false);
  });
});
