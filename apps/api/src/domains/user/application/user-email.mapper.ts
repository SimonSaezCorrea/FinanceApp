import type { auth } from "@finance/contracts";

import type { UserEmailProps } from "../../user-email/domain/user-email.entity";

export function userEmailToContract(email: UserEmailProps): auth.UserEmail {
  return {
    id: email.id,
    address: email.address,
    status: email.status,
    verifiedAt: email.verifiedAt ? email.verifiedAt.toISOString() : null,
    createdAt: email.createdAt.toISOString(),
    replacedAt: email.replacedAt ? email.replacedAt.toISOString() : null,
  };
}
