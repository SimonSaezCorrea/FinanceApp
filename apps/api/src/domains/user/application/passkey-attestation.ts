import { Injectable, Logger } from "@nestjs/common";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import {
  convertAAGUIDToString,
  decodeAttestationObject,
  isoBase64URL,
  isoCBOR,
  parseAuthenticatorData,
} from "@simplewebauthn/server/helpers";

import { AuthenticatorCatalog } from "./authenticator-catalog";

/** Attestation formats whose certificate the library checks against the catalog statement. */
const CATALOG_CHECKED_FORMATS: ReadonlySet<string> = new Set(["packed", "tpm", "android-key"]);
const ZERO_AAGUID = "00000000-0000-0000-0000-000000000000";

export interface RegistrationCheck {
  response: unknown;
  expectedChallenge: string;
  expectedOrigin: string | string[];
  expectedRPID: string;
}

export interface AttestationOutcome {
  verification: VerifiedRegistrationResponse;
  /** Set only when the attestation was verified against the FIDO catalog (research R4). */
  authenticator: { aaguid: string; name: string } | null;
}

type AttestationObject = Map<string, unknown>;

/**
 * Verifies a passkey registration and, when the authenticator proved its model, says which
 * (specs/041). Never stricter than before: an attestation that can't be verified is retried as
 * if the browser had sent none (research R5), so it only ever costs the model, never the passkey.
 */
@Injectable()
export class PasskeyAttestation {
  private readonly logger = new Logger(PasskeyAttestation.name);

  constructor(private readonly catalog: AuthenticatorCatalog) {}

  async verifyRegistration(check: RegistrationCheck): Promise<AttestationOutcome> {
    try {
      await this.catalog.ensureLoaded();
    } catch (err) {
      // No catalog → no statement → the passkey is simply unverified (FR-006).
      this.logger.warn(`FIDO catalog unavailable for a registration: ${String(err)}`);
    }

    const response = check.response as RegistrationResponseJSON;
    const attestation = decode(response);
    const format =
      typeof attestation?.get("fmt") === "string" ? String(attestation.get("fmt")) : "none";

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await this.verify(check, response);
    } catch (err) {
      if (format === "none" || !attestation) throw err;
      // An attestation the library rejected (unknown root, mismatching statement…): the same
      // registration without it — challenge, origin, RP and key are still checked.
      this.logger.warn(`Attestation "${format}" not verifiable, kept as none: ${String(err)}`);
      return {
        verification: await this.verify(check, withoutAttestation(response, attestation)),
        authenticator: null,
      };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { verification, authenticator: null };
    }
    const statement = attestation?.get("attStmt");
    const hasCertificate = statement instanceof Map && statement.has("x5c");
    const aaguid = verification.registrationInfo.aaguid;
    if (!CATALOG_CHECKED_FORMATS.has(format) || !hasCertificate || aaguid === ZERO_AAGUID) {
      return { verification, authenticator: null };
    }
    // The library checked the certificate against this AAGUID's catalog statement only if the
    // catalog has it; then the model is proven.
    const name = await this.catalog.modelName(aaguid);
    return { verification, authenticator: name ? { aaguid, name } : null };
  }

  /** The authenticator's AAGUID as it claims it, unverified — only to SUGGEST a name. */
  aaguidOf(response: unknown): string | null {
    try {
      const attestation = decode(response as RegistrationResponseJSON);
      const authData = attestation?.get("authData");
      if (!(authData instanceof Uint8Array)) return null;
      const parsed = parseAuthenticatorData(authData as Uint8Array<ArrayBuffer>);
      if (!parsed.aaguid) return null;
      const aaguid = convertAAGUIDToString(parsed.aaguid);
      return aaguid === ZERO_AAGUID ? null : aaguid;
    } catch {
      return null;
    }
  }

  protected verify(
    check: RegistrationCheck,
    response: RegistrationResponseJSON,
  ): Promise<VerifiedRegistrationResponse> {
    return verifyRegistrationResponse({
      response,
      expectedChallenge: check.expectedChallenge,
      expectedOrigin: check.expectedOrigin,
      expectedRPID: check.expectedRPID,
    });
  }
}

function decode(response: RegistrationResponseJSON | undefined): AttestationObject | null {
  try {
    const raw = response?.response?.attestationObject;
    if (typeof raw !== "string") return null;
    return decodeAttestationObject(isoBase64URL.toBuffer(raw)) as unknown as AttestationObject;
  } catch {
    return null;
  }
}

/** The same response with its attestation replaced by "none" (`fmt: "none"`, empty statement). */
export function withoutAttestation(
  response: RegistrationResponseJSON,
  attestation: AttestationObject,
): RegistrationResponseJSON {
  const none = new Map<string, unknown>([
    ["fmt", "none"],
    ["attStmt", new Map()],
    ["authData", attestation.get("authData")],
  ]);
  const encoded = isoCBOR.encode(none as never);
  return {
    ...response,
    response: { ...response.response, attestationObject: isoBase64URL.fromBuffer(encoded) },
  };
}
