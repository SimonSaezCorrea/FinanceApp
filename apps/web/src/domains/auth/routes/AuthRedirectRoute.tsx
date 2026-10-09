import { useSearchParams } from "react-router";

import { type AccessMode, landingAccessUrl } from "../../../shared/lib/landingUrl";
import { LeaveForLanding } from "../components/LeaveForLanding";

/** `/login` and `/register` are no longer screens of this app: signing in and registering live on
 * the public site (spec 031). Kept as URLs so bookmarks, password managers and old links
 * (`/login?volver=/accounts`) still land on the right view, with their return path. */
export function AuthRedirectRoute({ mode }: Readonly<{ mode: AccessMode }>) {
  const [params] = useSearchParams();
  return <LeaveForLanding url={landingAccessUrl(mode, params.get("volver"))} />;
}
