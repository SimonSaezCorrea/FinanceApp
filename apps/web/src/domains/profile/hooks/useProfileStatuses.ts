import { useTranslation } from "react-i18next";

import { isPasskeySupported } from "../../../shared/lib/webauthn";
import { useTheme } from "../../../theme/useTheme";
import { useAuth } from "../../auth/hooks/useAuth";
import { type SectionStatuses, sectionStatuses } from "../lib/profileStatus";
import { useConsentsQuery, usePasskeysQuery, useSessionsQuery } from "./useProfile";

/** Each profile section's status line and pending count, from the data the app already caches
 * (specs/029 FR-002). `null` until the user has loaded. */
export function useProfileStatuses(): SectionStatuses | null {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { mode } = useTheme();
  const passkeys = usePasskeysQuery();
  const sessions = useSessionsQuery();
  const consents = useConsentsQuery();
  if (!user) return null;

  return sectionStatuses(
    {
      user,
      passkeyCount: passkeys.data ? passkeys.data.length : null,
      passkeysSupported: isPasskeySupported(),
      openSessions: sessions.data ? sessions.data.filter((s) => s.closedAt === null).length : null,
      activeConsents: consents.data ? consents.data.filter((c) => !c.revokedAt).length : null,
      themeMode: mode,
    },
    t,
  );
}
