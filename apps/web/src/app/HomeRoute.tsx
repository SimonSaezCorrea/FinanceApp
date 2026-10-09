import { Suspense } from "react";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { AppSplash } from "../shared/ui/app-splash";
import { AppLayout, DashboardPage, LandingHomeRoute } from "./lazyPages";

/** `/` is two pages behind one URL: the public landing for a visitor, the Panel for a signed-in
 * user. Signing in from the landing's access panel flips it in place, with no redirect. Each side
 * is its own chunk, so a visitor never downloads the app and a user never the landing. */
export function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) return <AppSplash />;
  return (
    <Suspense fallback={<AppSplash />}>
      {user ? (
        <AppLayout>
          <DashboardPage />
        </AppLayout>
      ) : (
        <LandingHomeRoute />
      )}
    </Suspense>
  );
}
