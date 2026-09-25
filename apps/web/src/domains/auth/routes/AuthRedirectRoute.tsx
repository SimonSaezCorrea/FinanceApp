import { Navigate, useSearchParams } from "react-router";

import { type AuthPanelMode, RETURN_PARAM, authPath } from "../lib/authRedirect";

/** `/login` and `/register` are no longer screens of their own: they open the access panel
 * over the landing, on the right tab. Kept as URLs so bookmarks, password managers and old
 * links (`/login?volver=/accounts`) still work. */
export function AuthRedirectRoute({ mode }: Readonly<{ mode: AuthPanelMode }>) {
  const [params] = useSearchParams();
  return <Navigate to={authPath(mode, params.get(RETURN_PARAM))} replace />;
}
