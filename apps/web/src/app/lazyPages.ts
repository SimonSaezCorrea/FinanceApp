import { lazy } from "react";

import { loadLanguage } from "../i18n";

/**
 * Every page and the signed-in shell, loaded only when first visited. The entry bundle keeps just
 * the router, providers and auth, and a signed-in user downloads each section the first time they
 * open it (the public landing is its own site, spec 031). The `import()` paths are what Vite
 * splits into chunks — keep one per page.
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
// The importer recognises names in both languages (`getFixedT("en")`), so its chunk also brings
// the English catalog, which the app otherwise loads only for an English session.
export const ImportRoute = lazy(() =>
  Promise.all([import("../domains/import/routes/ImportRoute"), loadLanguage("en")]).then(([m]) => ({
    default: m.ImportRoute,
  })),
);
export const ProfileLayout = lazy(() =>
  import("../domains/profile/routes/ProfileLayout").then((m) => ({ default: m.ProfileLayout })),
);

// The 404 page.
export const NotFoundRoute = lazy(() =>
  import("./NotFoundRoute").then((m) => ({ default: m.NotFoundRoute })),
);

/** The chunk each address opens, for `preloadPage`. Same `import()` paths as above, so the browser
 * fetches each chunk once and `lazy` finds it already there. */
const PAGE_CHUNKS: [RegExp, () => Promise<unknown>][] = [
  [/^\/$/, () => import("./DashboardPage")],
  [/^\/accounts\/[^/]+/, () => import("../domains/accounts/routes/AccountDetailRoute")],
  [/^\/accounts\/?$/, () => import("../domains/accounts/routes/AccountsRoute")],
  [/^\/transactions/, () => import("../domains/transactions/routes/TransactionsRoute")],
  [/^\/installments/, () => import("../domains/installments/routes/InstallmentsRoute")],
  [/^\/debts/, () => import("../domains/debts/routes/DebtsRoute")],
  [/^\/recurring/, () => import("../domains/recurring/routes/RecurringRoute")],
  [/^\/savings/, () => import("../domains/savings/routes/SavingsRoute")],
  [/^\/exchange-rates/, () => import("../domains/exchange-rates/routes/ExchangeRatesRoute")],
  [/^\/import/, () => import("../domains/import/routes/ImportRoute")],
  [/^\/profile/, () => import("../domains/profile/routes/ProfileLayout")],
];

/**
 * Starts downloading the shell and the page an address opens while the session is still being
 * asked (`main.tsx`), instead of after it answers — otherwise the two waits run one after the other
 * (Lighthouse: page code requested only once `/auth/me` returned). A failed download is left for
 * `lazy` to retry and report.
 */
export function preloadPage(pathname: string): void {
  void import("./AppLayout").catch(() => undefined);
  const chunk = PAGE_CHUNKS.find(([pattern]) => pattern.test(pathname));
  if (chunk) void chunk[1]().catch(() => undefined);
}
