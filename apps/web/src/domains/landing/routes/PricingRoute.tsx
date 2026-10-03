import { ArrowRight, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { Eyebrow } from "../components/bits";
import { paint } from "../components/illustrations/paint";
import { LandingLayout } from "../components/LandingLayout";
import { useOpenAuth } from "../hooks/useOpenAuth";

const P = "landing.pricing";
const INCLUDED = ["accounts", "movements", "billing", "security", "currencies"] as const;
const REASONS = ["whyFree", "notYourData", "changes"] as const;

/**
 * "Precios" (canvas "Cuadra · Precios", PL2 reduced to the free plan): one plan card beside three
 * numbered reasons. It deliberately says nothing about a paid plan — that is an undecided
 * assumption, recorded in docs/PENDING.md ("Monetización"), not something to promise publicly.
 */
export function PricingRoute() {
  const { t } = useTranslation();
  const openAuth = useOpenAuth();

  return (
    <LandingLayout>
      <div className="flex flex-col gap-14 pb-20 pt-10 lg:gap-20 lg:pb-28 lg:pt-16">
        <header className="flex flex-col gap-5 lg:items-center lg:text-center">
          <Eyebrow className="text-accent">{t(`${P}.title`)}</Eyebrow>
          <h1
            tabIndex={-1}
            className="max-w-4xl text-4xl font-bold leading-[1.02] tracking-tight focus:outline-none sm:text-6xl"
          >
            {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
          </h1>
          <p className="max-w-[58ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t(`${P}.lead`)}
          </p>
        </header>

        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <article className="flex flex-col gap-6 rounded-[1.75rem] border-2 border-[hsl(var(--ridge-lit))] bg-card p-7 sm:p-10 lg:col-span-6">
            <PenReceipt className="h-28 w-full" />
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-sm font-bold text-[hsl(var(--ridge-line))]">
                {t("brand.name").toUpperCase()}
              </span>
              <strong className="text-5xl font-extrabold tracking-tight">{t(`${P}.free`)}</strong>
              <span className="text-[15px] text-muted-foreground">{t(`${P}.freeHint`)}</span>
            </div>
            <ul className="flex flex-col border-b">
              {INCLUDED.map((key) => (
                <li
                  key={key}
                  className="grid grid-cols-[1.375rem_minmax(0,1fr)] items-start gap-3 border-t py-3 text-[15px]"
                >
                  <Check
                    className="mt-0.5 h-[18px] w-[18px] text-[hsl(var(--ridge-line))]"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  {t(`${P}.included.${key}`)}
                </li>
              ))}
            </ul>
            <Button variant="accent" size="lg" onClick={() => openAuth("register")}>
              {t(`${P}.cta`)}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </article>

          <ol className="flex flex-col border-b border-border2 lg:col-span-5 lg:col-start-8">
            {REASONS.map((key, index) => (
              <li
                key={key}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-5 border-t border-border2 py-7"
              >
                <span
                  className={cn(
                    "font-mono text-4xl font-bold leading-none",
                    index === REASONS.length - 1 ? "text-accent" : "text-primary",
                  )}
                >
                  0{index + 1}
                </span>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-xl font-bold tracking-tight">
                    {t(`${P}.reasons.${key}.title`)}
                  </h2>
                  <p className="text-[15px] leading-relaxed text-muted-foreground">
                    {t(`${P}.reasons.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </LandingLayout>
  );
}

/** A receipt being filled in by hand — "tú registras; la app hace que cuadre". Decorative. */
function PenReceipt({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 520 120"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={className}
    >
      <rect width="520" height="120" rx="16" style={{ fill: paint("background") }} />
      <rect x="206" y="20" width="108" height="90" style={{ fill: paint("illus-paper") }} />
      <path
        d="M206 36 V28 L222 22 L232 28 L246 16 L258 26 L270 18 L284 26 L314 22 V36 Z"
        style={{ fill: paint("illus-seal") }}
      />
      <g style={{ fill: paint("illus-print") }}>
        <rect x="218" y="48" width="50" height="7" rx="3.5" />
        <rect x="286" y="48" width="18" height="7" rx="3.5" />
        <rect x="218" y="62" width="36" height="7" rx="3.5" />
        <rect x="286" y="62" width="18" height="7" rx="3.5" />
      </g>
      <path
        d="M226 88 q14 -10 28 0 t28 0"
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ stroke: paint("illus-seal") }}
      />
      <path d="M320 96 l38 -42 12 10 -38 42 -16 6 z" style={{ fill: paint("illus-sun") }} />
      <path d="M358 54 l6 -7 12 10 -6 7 z" style={{ fill: paint("illus-coin-edge") }} />
    </svg>
  );
}
