import { Navigate, useSearchParams } from "react-router";

import { safeReturnPath } from "@finance/client";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";

import { type AccessMode, landingAccessUrl } from "../../../shared/lib/landingUrl";
import { LeaveForLanding } from "../components/LeaveForLanding";
import { useAuth } from "../hooks/useAuth";

/** `/login` and `/register` are no longer screens of this app: signing in and registering live on
 * the public site (spec 031). Kept as URLs so bookmarks, password managers and old links
 * (`/login?volver=/accounts`) still land on the right view, with their return path. Someone who
 * is already signed in has nothing to do there: they go straight into the app, to `volver` when
 * it is a safe path (the same rule the landing applies after signing in), else the Panel. */
export function AuthRedirectRoute({ mode }: Readonly<{ mode: AccessMode }>) {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const volver = params.get("volver");

  if (loading) return <AppSplash />;
  if (user) return <Navigate to={safeReturnPath(volver)} replace />;
  return <LeaveForLanding url={landingAccessUrl(mode, volver)} />;
}
