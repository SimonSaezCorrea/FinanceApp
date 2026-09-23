import type { ReactElement } from "react";
import { createBrowserRouter } from "react-router";

import { AccountDetailRoute } from "../domains/accounts/routes/AccountDetailRoute";
import { AccountsRoute } from "../domains/accounts/routes/AccountsRoute";
import { RequireAuth } from "../domains/auth/components/RequireAuth";
import { LoginRoute } from "../domains/auth/routes/LoginRoute";
import { RegisterRoute } from "../domains/auth/routes/RegisterRoute";
import { DebtsRoute } from "../domains/debts/routes/DebtsRoute";
import { ImportRoute } from "../domains/import/routes/ImportRoute";
import { InstallmentsRoute } from "../domains/installments/routes/InstallmentsRoute";
import { AboutRoute } from "../domains/landing/routes/AboutRoute";
import { FaqRoute } from "../domains/landing/routes/FaqRoute";
import { PricingRoute } from "../domains/landing/routes/PricingRoute";
import { PrivacyRoute } from "../domains/landing/routes/PrivacyRoute";
import { ProductRoute } from "../domains/landing/routes/ProductRoute";
import { ProfileRoute } from "../domains/profile/routes/ProfileRoute";
import { RecurringRoute } from "../domains/recurring/routes/RecurringRoute";
import { SavingsRoute } from "../domains/savings/routes/SavingsRoute";
import { TransactionsRoute } from "../domains/transactions/routes/TransactionsRoute";
import { AppLayout } from "./AppLayout";
import { HomeRoute } from "./HomeRoute";

const protect = (element: ReactElement) => (
  <RequireAuth>
    <AppLayout>{element}</AppLayout>
  </RequireAuth>
);

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  { path: "/register", element: <RegisterRoute /> },
  // Public landing pages (Spanish slugs: the landing is for the Chilean market). `/` itself
  // is the landing for a visitor and the Panel once signed in — see HomeRoute.
  { path: "/", element: <HomeRoute /> },
  { path: "/producto/:view?", element: <ProductRoute /> },
  { path: "/nosotros", element: <AboutRoute /> },
  { path: "/privacidad", element: <PrivacyRoute /> },
  { path: "/precios", element: <PricingRoute /> },
  { path: "/preguntas", element: <FaqRoute /> },
  { path: "/accounts", element: protect(<AccountsRoute />) },
  { path: "/accounts/:id", element: protect(<AccountDetailRoute />) },
  // Editing is a PANEL over the account, not a separate screen — but it keeps its
  // own URL, so it stays deep-linkable and browser Back closes it. The detail
  // view renders behind it as the context the panel is editing.
  { path: "/accounts/:id/edit", element: protect(<AccountDetailRoute editing />) },
  { path: "/transactions", element: protect(<TransactionsRoute />) },
  { path: "/installments", element: protect(<InstallmentsRoute />) },
  { path: "/debts", element: protect(<DebtsRoute />) },
  { path: "/recurring", element: protect(<RecurringRoute />) },
  { path: "/savings", element: protect(<SavingsRoute />) },
  { path: "/import", element: protect(<ImportRoute />) },
  { path: "/profile", element: protect(<ProfileRoute />) },
]);
