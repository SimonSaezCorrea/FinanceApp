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
import { InvestmentsRoute } from "../domains/investments/routes/InvestmentsRoute";
import { ProfileRoute } from "../domains/profile/routes/ProfileRoute";
import { RecurringRoute } from "../domains/recurring/routes/RecurringRoute";
import { SavingsRoute } from "../domains/savings/routes/SavingsRoute";
import { TransactionsRoute } from "../domains/transactions/routes/TransactionsRoute";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "./DashboardPage";

const protect = (element: ReactElement) => (
  <RequireAuth>
    <AppLayout>{element}</AppLayout>
  </RequireAuth>
);

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  { path: "/register", element: <RegisterRoute /> },
  { path: "/", element: protect(<DashboardPage />) },
  { path: "/accounts", element: protect(<AccountsRoute />) },
  { path: "/accounts/:id", element: protect(<AccountDetailRoute />) },
  { path: "/transactions", element: protect(<TransactionsRoute />) },
  { path: "/installments", element: protect(<InstallmentsRoute />) },
  { path: "/debts", element: protect(<DebtsRoute />) },
  { path: "/recurring", element: protect(<RecurringRoute />) },
  { path: "/savings", element: protect(<SavingsRoute />) },
  { path: "/investments", element: protect(<InvestmentsRoute />) },
  { path: "/import", element: protect(<ImportRoute />) },
  { path: "/profile", element: protect(<ProfileRoute />) },
]);
