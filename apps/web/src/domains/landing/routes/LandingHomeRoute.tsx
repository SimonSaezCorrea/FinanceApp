import { ArrowRight, CalendarDays, Coins, ShieldCheck, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { CARD_KIND_STYLE } from "../../accounts/components/accountVisuals";
import { useSampleFormat } from "../hooks/useSampleFormat";
import { MonthKpiStrip } from "../components/MonthKpiStrip";
import { LandingLayout } from "../components/LandingLayout";
import { useOpenAuth } from "../hooks/useOpenAuth";

/** Public home: what the app is, an isometric stack of real-looking tiles, and four claims. */
export function LandingHomeRoute() {
  return (
    <LandingLayout>
      <LandingHome />
    </LandingLayout>
  );
}

function LandingHome() {
  const { t } = useTranslation();
  const openAuth = useOpenAuth();

  const claims: { icon: typeof Wallet; key: string }[] = [
    { icon: Wallet, key: "accountTypes" },
    { icon: CalendarDays, key: "businessDays" },
    { icon: Coins, key: "currencies" },
    { icon: ShieldCheck, key: "noBanks" },
  ];

  return (
    <section aria-labelledby="landing-home-title">
      <div className="grid items-center gap-10 py-10 lg:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)] lg:gap-14 lg:py-16">
        {/* Above the tilted stack: its 3D projection reaches back over this column. */}
        <div className="relative z-10">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("landing.home.eyebrow")}
          </span>
          <h1
            id="landing-home-title"
            tabIndex={-1}
            className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight focus:outline-none sm:text-5xl"
          >
            {t("landing.home.titleLead")}
            <br />
            <span className="text-primary">{t("landing.home.titleAccent")}</span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-base text-muted-foreground sm:text-lg">
            {t("landing.home.lead")}
          </p>
          <p className="mt-4 max-w-[48ch] text-sm text-muted-foreground">{t("landing.home.sub")}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="accent" size="lg" onClick={() => openAuth("register")}>
              {t("auth.createAccount")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Link
              to="/producto"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-6 text-base font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("landing.home.seeProduct")}
            </Link>
          </div>
        </div>

        <HeroStack />
      </div>

      <div className="grid gap-x-8 gap-y-10 border-t pb-16 pt-12 sm:grid-cols-2 lg:grid-cols-4">
        {claims.map(({ icon: Icon, key }) => (
          <div key={key}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <h2 className="text-base font-semibold leading-snug tracking-tight">
                {t(`landing.home.claims.${key}.title`)}
              </h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(`landing.home.claims.${key}.body`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The hero composition: a credit tile, a debit tile and the movements KPI strip, tilted
 * isometrically from `lg` up (where the hero goes two-column) and stacked flat below it, where
 * a tilt would make them unreadable. Figures are example data.
 */
function HeroStack() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  return (
    <div className="relative [perspective:1600px]" aria-hidden>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_55%_40%,hsl(var(--primary)/.22),transparent_70%)]" />
      <div className="grid gap-5 [transform-style:preserve-3d] sm:gap-6 lg:[transform:translateX(4%)_rotateX(46deg)_rotateZ(-38deg)_scale(.8)]">
        <HeroCard kind="CREDIT" className="lg:[transform:translateZ(70px)]">
          <CardTop
            title="BCI"
            subtitle={t("landing.home.preview.creditCardClp")}
            chip={t("landing.home.preview.credit")}
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium opacity-90">Visa Signature</p>
              <span className="rounded-full bg-[color-mix(in_srgb,currentColor_15%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                {t("landing.home.preview.primary")}
              </span>
            </div>
            <p className="text-base font-medium tabular-nums tracking-widest">
              •••• •••• •••• 4417
            </p>
            <div className="flex flex-col gap-1">
              <span className="text-xs opacity-70">{t("landing.home.preview.creditUsed")}</span>
              <p className="whitespace-nowrap tabular-nums">
                <span className="text-base font-semibold">{f.money(486190)}</span>
                <span className="text-xs opacity-70"> / {f.money(1800000)}</span>
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_20%,transparent)]">
                  <div className="h-full w-[27%] rounded-full bg-current" />
                </div>
                <span className="text-xs font-medium tabular-nums opacity-90">27%</span>
              </div>
            </div>
          </div>
          <CardBottom holder="S. Sáez" expiry="09/29" />
        </HeroCard>

        <HeroCard kind="DEBIT" className="ml-auto lg:[transform:translateZ(28px)]">
          <CardTop
            title="Banco de Chile"
            subtitle={t("landing.home.preview.checkingClp")}
            chip={t("landing.home.preview.debit")}
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium opacity-90">{t("landing.home.preview.checking")}</p>
            <p className="text-base font-medium tabular-nums tracking-widest">
              •••• •••• •••• 8821
            </p>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs opacity-70">{t("landing.home.preview.balance")}</span>
              <p className="text-base font-semibold tabular-nums">{f.money(1240000)}</p>
            </div>
          </div>
          <CardBottom holder="S. Sáez" expiry="03/28" />
        </HeroCard>

        <MonthKpiStrip className="max-w-md" />
      </div>
    </div>
  );
}

function HeroCard({
  kind,
  className,
  children,
}: Readonly<{ kind: "CREDIT" | "DEBIT"; className?: string; children: ReactNode }>) {
  return (
    <div
      className={cn(
        "relative flex min-h-[11rem] w-full max-w-md shrink-0 flex-col overflow-hidden rounded-2xl p-4 text-left shadow-md sm:min-h-[12.5rem] sm:p-5",
        CARD_KIND_STYLE[kind],
        className,
      )}
    >
      <div className="flex h-full flex-col justify-between gap-2 sm:gap-3">{children}</div>
    </div>
  );
}

function CardTop({
  title,
  subtitle,
  chip,
}: Readonly<{ title: string; subtitle: string; chip: string }>) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        <p className="truncate text-xs opacity-80">{subtitle}</p>
      </div>
      <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,currentColor_15%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
        {chip}
      </span>
    </div>
  );
}

function CardBottom({ holder, expiry }: Readonly<{ holder: string; expiry: string }>) {
  return (
    <div className="flex items-end justify-between">
      <span className="text-xs font-medium uppercase tracking-wide opacity-90">{holder}</span>
      <span className="text-xs tabular-nums opacity-90">{expiry}</span>
    </div>
  );
}
