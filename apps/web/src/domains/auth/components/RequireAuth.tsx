import type { ReactNode } from "react";
import { useLocation } from "react-router";

import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";
import { landingAccessUrl } from "../../../shared/lib/landingUrl";
import { useAuth } from "../hooks/useAuth";
import { LeaveForLanding } from "./LeaveForLanding";

/** Gates routes behind authentication. Signed out, it leaves for the public site's access panel
 * and remembers the page that was asked for, so signing in lands back on it. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname, search, hash } = useLocation();

  if (loading) return <AppSplash />;
  if (!user) return <LeaveForLanding url={landingAccessUrl("login", pathname + search + hash)} />;
  return <>{children}</>;
}
