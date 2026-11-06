import type { auth } from "@finance/contracts";

import type { PasskeyProps } from "../../passkey/domain/passkey.entity";

/** A passkey as the API shows it (specs/041 adds its catalog status and model, read-only). */
export function passkeyToContract(p: PasskeyProps): auth.Passkey {
  let status: auth.PasskeyStatus = "unverified";
  if (p.compromisedAt) status = "compromised";
  else if (p.verifiedAt) status = "verified";
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    status,
    authenticatorName: p.authenticatorName,
    compromisedAt: p.compromisedAt,
  };
}
