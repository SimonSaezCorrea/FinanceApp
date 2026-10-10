import { Suspense } from "react";
import { Outlet } from "react-router";

import { RequireAuth } from "../domains/auth/components/RequireAuth";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";
import { AppLayout } from "./lazyPages";
import { PageSkeleton } from "./PageSkeleton";

/**
 * The layout route every signed-in page renders inside, the Panel and the 404 included. It mounts
 * ONCE: moving between sections only swaps the `Outlet`, so the splash is seen only while the
 * session is first asked (a reload, arriving from sign-in) and the shell's own chunk arrives. A
 * section whose chunk isn't there yet shows a page-shaped skeleton inside the shell, never the
 * splash.
 */
export function AppShell() {
  return (
    <RequireAuth>
      <Suspense fallback={<AppSplash />}>
        <AppLayout>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </AppLayout>
      </Suspense>
    </RequireAuth>
  );
}
