import { Suspense } from "react";

import { LeaveForLanding } from "../domains/auth/components/LeaveForLanding";
import { useAuth } from "../domains/auth/hooks/useAuth";
import { landingAccessUrl } from "../shared/lib/landingUrl";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";
import { AppLayout, DashboardPage } from "./lazyPages";

/** `/` is the Panel. The public landing is its own site (spec 031), so a signed-out visit leaves
 * for its access panel instead. */
export function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) return <AppSplash />;
  if (!user) return <LeaveForLanding url={landingAccessUrl("login")} />;
  return (
    <Suspense fallback={<AppSplash />}>
      <AppLayout>
        <DashboardPage />
      </AppLayout>
    </Suspense>
  );
}
