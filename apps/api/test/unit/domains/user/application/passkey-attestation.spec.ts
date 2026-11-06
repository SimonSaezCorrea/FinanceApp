import { describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@simplewebauthn/server")>()),
  verifyRegistrationResponse: vi.fn(),
}));

import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { decodeAttestationObject, isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

import type { AuthenticatorCatalog } from "../../../../../src/domains/user/application/authenticator-catalog";
import { PasskeyAttestation } from "../../../../../src/domains/user/application/passkey-attestation";

const AAGUID = "cb69481e-8ff7-4039-93ec-0a2729a154a8";

/** A minimal authenticator data with attested credential data for `aaguid`. */
function authData(aaguid: string): Uint8Array {
  const aaguidBytes = Uint8Array.from(Buffer.from(aaguid.replace(/-/g, ""), "hex"));
  const credId = new Uint8Array([9, 9]);
  const publicKey = isoCBOR.encode(new Map<number, number>([[1, 2]]) as never);
  return new Uint8Array([
    ...new Uint8Array(32),
    0x41, // UP + AT
    0,
    0,
    0,
    1,
    ...aaguidBytes,
    0,
    credId.length,
    ...credId,
    ...publicKey,
  ]);
}

function response(fmt: string, attStmt: Map<string, unknown>, aaguid = AAGUID) {
  const attestationObject = isoCBOR.encode(
    new Map<string, unknown>([
      ["fmt", fmt],
      ["attStmt", attStmt],
      ["authData", authData(aaguid)],
    ]) as never,
  );
  return {
    id: "cred1",
    rawId: "cred1",
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "e30",
      attestationObject: isoBase64URL.fromBuffer(attestationObject),
    },
  };
}

const withCert = () =>
  new Map<string, unknown>([
    ["x5c", [new Uint8Array([1])]],
    ["sig", new Uint8Array([2])],
  ]);

function setup(modelName: string | null = "YubiKey 5") {
  const catalog = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    modelName: vi.fn().mockResolvedValue(modelName),
  } as unknown as AuthenticatorCatalog;
  return new PasskeyAttestation(catalog);
}

const check = (res: unknown) => ({
  response: res,
  expectedChallenge: "c",
  expectedOrigin: "http://localhost",
  expectedRPID: "localhost",
});

const verified = (aaguid = AAGUID) =>
  ({ verified: true, registrationInfo: { aaguid, credential: { id: "cred1" } } }) as never;

describe("PasskeyAttestation (specs/041)", () => {
  it("a packed attestation with a certificate and a catalog model is verified", async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue(verified());
    const outcome = await setup().verifyRegistration(check(response("packed", withCert())));
    expect(outcome.authenticator).toEqual({ aaguid: AAGUID, name: "YubiKey 5" });
  });

  it("none, apple, self attestation, a zero or unknown AAGUID stay unverified", async () => {
    vi.mocked(verifyRegistrationResponse).mockResolvedValue(verified());
    expect(
      (await setup().verifyRegistration(check(response("none", new Map())))).authenticator,
    ).toBeNull();
    expect(
      (await setup().verifyRegistration(check(response("apple", withCert())))).authenticator,
    ).toBeNull();
    expect(
      (
        await setup().verifyRegistration(
          check(response("packed", new Map([["sig", new Uint8Array([1])]]))),
        )
      ).authenticator,
    ).toBeNull();
    expect(
      (await setup(null).verifyRegistration(check(response("packed", withCert())))).authenticator,
    ).toBeNull();
    vi.mocked(verifyRegistrationResponse).mockResolvedValue(
      verified("00000000-0000-0000-0000-000000000000"),
    );
    expect(
      (await setup().verifyRegistration(check(response("packed", withCert())))).authenticator,
    ).toBeNull();
  });

  it("an attestation the library rejects is retried as none and kept unverified", async () => {
    vi.mocked(verifyRegistrationResponse)
      .mockRejectedValueOnce(new Error("unknown root"))
      .mockResolvedValueOnce(verified());
    const outcome = await setup().verifyRegistration(check(response("packed", withCert())));
    expect(outcome.authenticator).toBeNull();
    const calls = vi.mocked(verifyRegistrationResponse).mock.calls;
    const retried = calls[calls.length - 1]![0].response;
    const decoded = decodeAttestationObject(
      isoBase64URL.toBuffer(retried.response.attestationObject),
    ) as unknown as Map<string, unknown>;
    expect(decoded.get("fmt")).toBe("none");
    expect((decoded.get("attStmt") as Map<string, unknown>).size).toBe(0);
  });

  it("a failure of the none retry, or of a none registration, still throws", async () => {
    vi.mocked(verifyRegistrationResponse).mockRejectedValue(new Error("bad challenge"));
    await expect(setup().verifyRegistration(check(response("packed", withCert())))).rejects.toThrow(
      "bad challenge",
    );
    await expect(setup().verifyRegistration(check(response("none", new Map())))).rejects.toThrow(
      "bad challenge",
    );
  });

  it("reads the claimed AAGUID without verifying, for the name suggestion", () => {
    expect(setup().aaguidOf(response("none", new Map()))).toBe(AAGUID);
    expect(
      setup().aaguidOf(response("none", new Map(), "00000000-0000-0000-0000-000000000000")),
    ).toBeNull();
    expect(setup().aaguidOf({ nope: true })).toBeNull();
  });
});
