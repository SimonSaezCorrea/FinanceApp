/**
 * WebAuthn helpers (specs/022) — `navigator.credentials.create()`/`.get()` are native browser
 * APIs, so no library is needed; the only real work is converting their `ArrayBuffer` fields
 * to/from base64url so they can travel as JSON, same criterion that kept the MFA QR backend-only.
 */

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Feature-detects WebAuthn conditional mediation (autofill-driven passkey suggestions,
 * specs/025) — Chrome/Edge 109+ and Safari 16+ support it, Firefox doesn't at all. Never throws:
 * an unsupported browser (missing the static method entirely) or any runtime error both resolve
 * `false`, which the caller treats as "don't attempt it", never as an error (FR-007). */
export async function isConditionalMediationSupported(): Promise<boolean> {
  const PKC = window.PublicKeyCredential as
    | (typeof PublicKeyCredential & { isConditionalMediationAvailable?: () => Promise<boolean> })
    | undefined;
  if (!PKC?.isConditionalMediationAvailable) return false;
  try {
    return await PKC.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

/** Converts the server's JSON registration options into what `navigator.credentials.create()`
 * expects (`challenge`/`user.id`/`excludeCredentials[].id` as real `ArrayBuffer`s). */
export function toCreateOptions(options: unknown): CredentialCreationOptions {
  const o = options as {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: { id: string; transports?: AuthenticatorTransport[] }[];
    [key: string]: unknown;
  };
  return {
    publicKey: {
      ...o,
      challenge: base64urlToBuffer(o.challenge),
      user: { ...o.user, id: base64urlToBuffer(o.user.id) },
      excludeCredentials: o.excludeCredentials?.map((c) => ({
        ...c,
        id: base64urlToBuffer(c.id),
      })),
    } as PublicKeyCredentialCreationOptions,
  };
}

/** Converts the server's JSON authentication options into what `navigator.credentials.get()`
 * expects. `mediation`/`signal` are top-level `CredentialRequestOptions` fields (not inside
 * `publicKey`) — `mediation: "conditional"` is what the autofill-driven login (specs/025) needs;
 * the explicit-button login passes neither and gets the browser's own default. */
export function toGetOptions(
  options: unknown,
  extra?: { mediation?: CredentialMediationRequirement; signal?: AbortSignal },
): CredentialRequestOptions {
  const o = options as {
    challenge: string;
    allowCredentials?: { id: string; transports?: AuthenticatorTransport[] }[];
    [key: string]: unknown;
  };
  return {
    publicKey: {
      ...o,
      challenge: base64urlToBuffer(o.challenge),
      allowCredentials: o.allowCredentials?.map((c) => ({ ...c, id: base64urlToBuffer(c.id) })),
    } as PublicKeyCredentialRequestOptions,
    ...(extra?.mediation ? { mediation: extra.mediation } : {}),
    ...(extra?.signal ? { signal: extra.signal } : {}),
  };
}

/** Serializes what the browser returns from `navigator.credentials.create()` into JSON the
 * backend can verify. */
export function serializeCreateResponse(credential: Credential): unknown {
  const cred = credential as PublicKeyCredential;
  const response = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** Serializes what the browser returns from `navigator.credentials.get()` into JSON the backend
 * can verify. */
export function serializeGetResponse(credential: Credential): unknown {
  const cred = credential as PublicKeyCredential;
  const response = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}
