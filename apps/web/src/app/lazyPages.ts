import { lazy } from "react";

/**
 * Every page and the signed-in shell, loaded only when first visited. The entry bundle keeps just
 * the router, providers and auth, and a signed-in user downloads each section the first time they
 * open it (the public landing is its own site, spec 031). The `import()` paths are what Vite splits into chunks — keep one per page.
 */

// Signed-in shell (sidebar, tab bar, "Nuevo movimiento").
export const AppLayout = lazy(() => import("./AppLayout").then((m) => ({ default: m.AppLayout })));
export const DashboardPage = lazy(() =>
  import("./DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

// App sections.
export const AccountsRoute = lazy(() =>
  import("../domains/accounts/routes/AccountsRoute").then((m) => ({ default: m.AccountsRoute })),
);
export const AccountDetailRoute = lazy(() =>
  import("../domains/accounts/routes/AccountDetailRoute").then((m) => ({
    default: m.AccountDetailRoute,
  })),
);
export const TransactionsRoute = lazy(() =>
  import("../domains/transactions/routes/TransactionsRoute").then((m) => ({
    default: m.TransactionsRoute,
  })),
);
export const InstallmentsRoute = lazy(() =>
  import("../domains/installments/routes/InstallmentsRoute").then((m) => ({
    default: m.InstallmentsRoute,
  })),
);
export const DebtsRoute = lazy(() =>
  import("../domains/debts/routes/DebtsRoute").then((m) => ({ default: m.DebtsRoute })),
);
export const RecurringRoute = lazy(() =>
  import("../domains/recurring/routes/RecurringRoute").then((m) => ({
    default: m.RecurringRoute,
  })),
);
export const SavingsRoute = lazy(() =>
  import("../domains/savings/routes/SavingsRoute").then((m) => ({ default: m.SavingsRoute })),
);
export const ExchangeRatesRoute = lazy(() =>
  import("../domains/exchange-rates/routes/ExchangeRatesRoute").then((m) => ({
    default: m.ExchangeRatesRoute,
  })),
);
export const ImportRoute = lazy(() =>
  import("../domains/import/routes/ImportRoute").then((m) => ({ default: m.ImportRoute })),
);
export const ProfileLayout = lazy(() =>
  import("../domains/profile/routes/ProfileLayout").then((m) => ({ default: m.ProfileLayout })),
);

// The 404 page.
export const NotFoundRoute = lazy(() =>
  import("./NotFoundRoute").then((m) => ({ default: m.NotFoundRoute })),
);
