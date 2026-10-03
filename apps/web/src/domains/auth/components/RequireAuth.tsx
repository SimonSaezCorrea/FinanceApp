import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { AppSplash } from "../../../shared/ui/app-splash";
import { useAuth } from "../hooks/useAuth";
import { authPath } from "../lib/authRedirect";

/** Gates routes behind authentication. Signed out, it opens the access panel over the landing
 * and remembers the page that was asked for, so signing in lands back on it. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname, search } = useLocation();

  if (loading) return <AppSplash />;
  if (!user) return <Navigate to={authPath("login", pathname + search)} replace />;
  return <>{children}</>;
}
