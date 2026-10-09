import { type ReactElement, Suspense } from "react";
import { createBrowserRouter } from "react-router";

import { RequireAuth } from "../domains/auth/components/RequireAuth";
import { AuthRedirectRoute } from "../domains/auth/routes/AuthRedirectRoute";
import { PROFILE_CHILD_ROUTES } from "../domains/profile/routes/profileRoutes";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";
import { DocumentTitle } from "./DocumentTitle";
import { HomeRoute } from "./HomeRoute";
import {
  AboutRoute,
  AccountDetailRoute,
  AccountsRoute,
  AppLayout,
  DebtsRoute,
  ExchangeRatesRoute,
  FaqRoute,
  ImportRoute,
  InstallmentsRoute,
  NotFoundRoute,
  PricingRoute,
  PrivacyRoute,
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

/** A public page: the splash covers the first moment its chunk is on its way. */
const page = (element: ReactElement) => <Suspense fallback={<AppSplash />}>{element}</Suspense>;

const handle = (h: TitleHandle) => h;

export const router = createBrowserRouter([
  {
    element: <DocumentTitle />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Access is a side panel over the landing (`/?acceso=login|registro`); these stay as URLs.
      { path: "/login", element: <AuthRedirectRoute mode="login" /> },
      { path: "/register", element: <AuthRedirectRoute mode="register" /> },
      // Public landing pages (Spanish slugs: the landing is for the Chilean market). `/` itself
      // is the landing for a visitor and the Panel once signed in — see HomeRoute.
      { path: "/", element: <HomeRoute />, handle: handle({ signedInTitle: "nav.dashboard" }) },
      {
        path: "/nosotros",
        element: page(<AboutRoute />),
        handle: handle({ title: "landing.nav.about" }),
      },
      {
        path: "/privacidad",
        element: page(<PrivacyRoute />),
        handle: handle({ title: "landing.nav.privacy" }),
      },
      {
        path: "/precios",
        element: page(<PricingRoute />),
        handle: handle({ title: "landing.nav.pricing" }),
      },
      {
        path: "/preguntas",
        element: page(<FaqRoute />),
        handle: handle({ title: "landing.nav.faq" }),
      },
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
