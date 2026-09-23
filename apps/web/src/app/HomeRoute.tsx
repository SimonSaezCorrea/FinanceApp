import { useAuth } from "../domains/auth/hooks/useAuth";
import { LandingHomeRoute } from "../domains/landing/routes/LandingHomeRoute";
import { AppSplash } from "../shared/ui/app-splash";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "./DashboardPage";

/** `/` is two pages behind one URL: the public landing for a visitor, the Panel for a signed-in
 * user. Signing in from the landing's access panel flips it in place, with no redirect. */
export function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) return <AppSplash />;
  if (!user) return <LandingHomeRoute />;
  return (
    <AppLayout>
      <DashboardPage />
    </AppLayout>
  );
}
