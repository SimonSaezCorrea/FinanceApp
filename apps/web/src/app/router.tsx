import type { ReactElement } from "react";
import { createBrowserRouter } from "react-router";

import { AccountDetailRoute } from "../domains/accounts/routes/AccountDetailRoute";
import { AccountsRoute } from "../domains/accounts/routes/AccountsRoute";
import { RequireAuth } from "../domains/auth/components/RequireAuth";
import { AuthRedirectRoute } from "../domains/auth/routes/AuthRedirectRoute";
import { DebtsRoute } from "../domains/debts/routes/DebtsRoute";
import { ImportRoute } from "../domains/import/routes/ImportRoute";
import { InstallmentsRoute } from "../domains/installments/routes/InstallmentsRoute";
import { AboutRoute } from "../domains/landing/routes/AboutRoute";
import { FaqRoute } from "../domains/landing/routes/FaqRoute";
import { PricingRoute } from "../domains/landing/routes/PricingRoute";
import { PrivacyRoute } from "../domains/landing/routes/PrivacyRoute";
import { ProfileRoute } from "../domains/profile/routes/ProfileRoute";
import { RecurringRoute } from "../domains/recurring/routes/RecurringRoute";
import { SavingsRoute } from "../domains/savings/routes/SavingsRoute";
import { TransactionsRoute } from "../domains/transactions/routes/TransactionsRoute";
import { AppLayout } from "./AppLayout";
import { DocumentTitle } from "./DocumentTitle";
import { HomeRoute } from "./HomeRoute";
import { NotFoundRoute } from "./NotFoundRoute";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import type { TitleHandle } from "./tabTitle";

const protect = (element: ReactElement) => (
  <RequireAuth>
    <AppLayout>{element}</AppLayout>
  </RequireAuth>
);

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
        element: <AboutRoute />,
        handle: handle({ title: "landing.nav.about" }),
      },
      {
        path: "/privacidad",
        element: <PrivacyRoute />,
        handle: handle({ title: "landing.nav.privacy" }),
      },
      {
        path: "/precios",
        element: <PricingRoute />,
        handle: handle({ title: "landing.nav.pricing" }),
      },
      { path: "/preguntas", element: <FaqRoute />, handle: handle({ title: "landing.nav.faq" }) },
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
        path: "/import",
        element: protect(<ImportRoute />),
        handle: handle({ title: "import.title" }),
      },
      {
        path: "/profile",
        element: protect(<ProfileRoute />),
        handle: handle({ title: "profile.title" }),
      },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);
