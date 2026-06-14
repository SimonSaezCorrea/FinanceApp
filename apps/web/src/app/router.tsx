import type { ReactElement } from "react";
import { createBrowserRouter } from "react-router-dom";

import { AccountsRoute } from "../domains/accounts/routes/AccountsRoute";
import { RequireAuth } from "../domains/auth/components/RequireAuth";
import { LoginRoute } from "../domains/auth/routes/LoginRoute";
import { RegisterRoute } from "../domains/auth/routes/RegisterRoute";
import { DebtsRoute } from "../domains/debts/routes/DebtsRoute";
import { ImportRoute } from "../domains/import/routes/ImportRoute";
import { InstallmentsRoute } from "../domains/installments/routes/InstallmentsRoute";
import { InvestmentsRoute } from "../domains/investments/routes/InvestmentsRoute";
import { SavingsRoute } from "../domains/savings/routes/SavingsRoute";
import { TransactionsRoute } from "../domains/transactions/routes/TransactionsRoute";
import { DashboardPage } from "./DashboardPage";

const protect = (element: ReactElement) => <RequireAuth>{element}</RequireAuth>;

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  { path: "/register", element: <RegisterRoute /> },
  { path: "/", element: protect(<DashboardPage />) },
  { path: "/accounts", element: protect(<AccountsRoute />) },
  { path: "/transactions", element: protect(<TransactionsRoute />) },
  { path: "/installments", element: protect(<InstallmentsRoute />) },
  { path: "/debts", element: protect(<DebtsRoute />) },
  { path: "/savings", element: protect(<SavingsRoute />) },
  { path: "/investments", element: protect(<InvestmentsRoute />) },
  { path: "/import", element: protect(<ImportRoute />) },
]);
