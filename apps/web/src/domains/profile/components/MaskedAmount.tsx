import type { ReactNode } from "react";

import { useAuth } from "../../auth/hooks/useAuth";

/**
 * Wraps a monetary display; renders a mask instead when the user's `hideBalances` preference is
 * on. Real, persisted preference — but only wired into the highest-visibility amounts (dashboard
 * net worth, account cards) in this pass, not every money label app-wide (see PENDING.md).
 */
export function MaskedAmount({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  if (user?.hideBalances) return <span aria-hidden="true">••••••</span>;
  return <>{children}</>;
}
