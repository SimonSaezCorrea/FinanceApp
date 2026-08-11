import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { AppSplash } from "../../../shared/ui/app-splash";
import { useAuth } from "../hooks/useAuth";

/** Gates routes behind authentication; redirects to /login when signed out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <AppSplash />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
