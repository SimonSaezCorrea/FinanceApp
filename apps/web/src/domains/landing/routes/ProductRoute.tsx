import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router";

import { Badge } from "../../../shared/ui/badge";
import { Tabs } from "../../../shared/ui/tabs";
import { PageIntro } from "../components/bits";
import { LandingLayout } from "../components/LandingLayout";
import { AccountsView } from "../components/product/AccountsView";
import { DebtsView } from "../components/product/DebtsView";
import { InstallmentsView } from "../components/product/InstallmentsView";
import { MovementsView } from "../components/product/MovementsView";
import { RecurringView } from "../components/product/RecurringView";
import { SavingsView } from "../components/product/SavingsView";

/** One tab per item of the app's own navigation; the slug is the URL (`/producto/cuotas`) so a
 * view can be linked directly and Back walks through the tabs visited. */
const VIEWS = {
  cuentas: { key: "accounts", Component: AccountsView },
  movimientos: { key: "movements", Component: MovementsView },
  cuotas: { key: "installments", Component: InstallmentsView },
  deudas: { key: "debts", Component: DebtsView },
  recurrentes: { key: "recurring", Component: RecurringView },
  ahorros: { key: "savings", Component: SavingsView },
} satisfies Record<string, { key: string; Component: ComponentType }>;

type ViewSlug = keyof typeof VIEWS;

const isViewSlug = (value: string | undefined): value is ViewSlug =>
  value !== undefined && value in VIEWS;

export function ProductRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { view } = useParams();

  if (view !== undefined && !isViewSlug(view)) return <Navigate to="/producto" replace />;
  const active: ViewSlug = view ?? "cuentas";
  const { Component } = VIEWS[active];

  return (
    <LandingLayout>
      <section className="flex flex-col gap-6 pt-10">
        <PageIntro
          title={t("landing.product.title")}
          description={t("landing.product.subtitle")}
          aside={<Badge className="shrink-0">{t("landing.product.badge")}</Badge>}
        />
        <Tabs<ViewSlug>
          value={active}
          onChange={(slug) => navigate(`/producto/${slug}`)}
          items={(Object.keys(VIEWS) as ViewSlug[]).map((slug) => ({
            value: slug,
            label: t(`landing.product.${VIEWS[slug].key}.title`),
          }))}
          className="flex-wrap gap-x-5"
        />
      </section>
      <Component />
    </LandingLayout>
  );
}
