import { createBrowserRouter } from "react-router";

import { AuthRedirectRoute } from "../domains/auth/routes/AuthRedirectRoute";
import { PROFILE_CHILD_ROUTES } from "../domains/profile/routes/profileRoutes";
import { AppShell } from "./AppShell";
import { DocumentTitle } from "./DocumentTitle";
import {
  AccountDetailRoute,
  AccountsRoute,
  CustomFieldsRoute,
  DashboardPage,
  DebtsRoute,
  ExchangeRatesRoute,
  ImportRoute,
  InstallmentsRoute,
  NotFoundPage,
  ProfileLayout,
  RecurringRoute,
  SavingsRoute,
  TransactionsRoute,
} from "./lazyPages";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import type { TitleHandle } from "./tabTitle";

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
      {
        // Every page of the app: one shell, mounted once (`AppShell`), each page swapped inside it.
        element: <AppShell />,
        children: [
          { path: "/", element: <DashboardPage />, handle: handle({ title: "nav.dashboard" }) },
          {
            path: "/accounts",
            element: <AccountsRoute />,
            handle: handle({ title: "accounts.title" }),
          },
          {
            path: "/accounts/:id",
            element: <AccountDetailRoute />,
            handle: handle({ title: "accounts.title" }),
          },
          // Editing is a PANEL over the account, not a separate screen — but it keeps its
          // own URL, so it stays deep-linkable and browser Back closes it. The detail
          // view renders behind it as the context the panel is editing.
          {
            path: "/accounts/:id/edit",
            element: <AccountDetailRoute editing />,
            handle: handle({ title: "accounts.title" }),
          },
          {
            path: "/transactions",
            element: <TransactionsRoute />,
            handle: handle({ title: "transactions.title" }),
          },
          {
            path: "/installments",
            element: <InstallmentsRoute />,
            handle: handle({ title: "installments.title" }),
          },
          {
            path: "/debts",
            element: <DebtsRoute />,
            handle: handle({ title: "debts.title" }),
          },
          {
            path: "/recurring",
            element: <RecurringRoute />,
            handle: handle({ title: "recurring.title" }),
          },
          {
            path: "/savings",
            element: <SavingsRoute />,
            handle: handle({ title: "savings.title" }),
          },
          {
            path: "/exchange-rates",
            element: <ExchangeRatesRoute />,
            handle: handle({ title: "nav.exchangeRates" }),
          },
          {
            path: "/custom-fields",
            element: <CustomFieldsRoute />,
            handle: handle({ title: "nav.customFields" }),
          },
          {
            path: "/import",
            element: <ImportRoute />,
            handle: handle({ title: "import.title" }),
          },
          {
            // One route per section (specs/029): `/profile` is the summary, the rest are children.
            path: "/profile",
            element: <ProfileLayout />,
            handle: handle({ title: "profile.title" }),
            children: PROFILE_CHILD_ROUTES,
          },
          // An address no route claims: the 404 inside the app, or sign in first (`RequireAuth`).
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
