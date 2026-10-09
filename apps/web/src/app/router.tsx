import { type ReactElement, Suspense } from "react";
import { createBrowserRouter } from "react-router";

import { RequireAuth } from "../domains/auth/components/RequireAuth";
import { AuthRedirectRoute } from "../domains/auth/routes/AuthRedirectRoute";
import { PROFILE_CHILD_ROUTES } from "../domains/profile/routes/profileRoutes";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";
import { DocumentTitle } from "./DocumentTitle";
import { HomeRoute } from "./HomeRoute";
import {
  AccountDetailRoute,
  AccountsRoute,
  AppLayout,
  DebtsRoute,
  ExchangeRatesRoute,
  ImportRoute,
  InstallmentsRoute,
  NotFoundRoute,
  ProfileLayout,
  RecurringRoute,
  SavingsRoute,
  TransactionsRoute,
} from "./lazyPages";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import type { TitleHandle } from "./tabTitle";

/** Every page is a lazy chunk (`lazyPages`). The shell waits behind the splash the first time; a
 * page then loads INSIDE the shell, so the sidebar never blinks while a section arrives. */
const protect = (element: ReactElement) => (
  <RequireAuth>
    <Suspense fallback={<AppSplash />}>
      <AppLayout>
        <Suspense fallback={null}>{element}</Suspense>
      </AppLayout>
    </Suspense>
  </RequireAuth>
);

/** A page outside the shell (the 404): the splash covers the moment its chunk is on its way. */
const page = (element: ReactElement) => <Suspense fallback={<AppSplash />}>{element}</Suspense>;

const handle = (h: TitleHandle) => h;

export const router = createBrowserRouter([
  {
    element: <DocumentTitle />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Signing in and registering live on the public site (spec 031); these stay as URLs that
      // send there, so bookmarks and password managers keep working.
      { path: "/login", element: <AuthRedirectRoute mode="login" /> },
      { path: "/register", element: <AuthRedirectRoute mode="register" /> },
      { path: "/", element: <HomeRoute />, handle: handle({ signedInTitle: "nav.dashboard" }) },
      {
        path: "/accounts",
        element: protect(<AccountsRoute />),
        handle: handle({ title: "accounts.title" }),
      },
      {
        path: "/accounts/:id",
        element: protect(<AccountDetailRoute />),
        handle: handle({ title: "accounts.title" }),
      },
      // Editing is a PANEL over the account, not a separate screen — but it keeps its
      // own URL, so it stays deep-linkable and browser Back closes it. The detail
      // view renders behind it as the context the panel is editing.
      {
        path: "/accounts/:id/edit",
        element: protect(<AccountDetailRoute editing />),
        handle: handle({ title: "accounts.title" }),
      },
      {
        path: "/transactions",
        element: protect(<TransactionsRoute />),
        handle: handle({ title: "transactions.title" }),
      },
      {
        path: "/installments",
        element: protect(<InstallmentsRoute />),
        handle: handle({ title: "installments.title" }),
      },
      {
        path: "/debts",
        element: protect(<DebtsRoute />),
        handle: handle({ title: "debts.title" }),
      },
      {
        path: "/recurring",
        element: protect(<RecurringRoute />),
        handle: handle({ title: "recurring.title" }),
      },
      {
        path: "/savings",
        element: protect(<SavingsRoute />),
        handle: handle({ title: "savings.title" }),
      },
      {
        path: "/exchange-rates",
        element: protect(<ExchangeRatesRoute />),
        handle: handle({ title: "nav.exchangeRates" }),
      },
      {
        path: "/import",
        element: protect(<ImportRoute />),
        handle: handle({ title: "import.title" }),
      },
      {
        // One route per section (specs/029): `/profile` is the summary, the rest are children.
        path: "/profile",
        element: protect(<ProfileLayout />),
        handle: handle({ title: "profile.title" }),
        children: PROFILE_CHILD_ROUTES,
      },
      { path: "*", element: page(<NotFoundRoute />) },
    ],
  },
]);
