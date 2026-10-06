import { formatMoney } from "@finance/money";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { useOpenAuth } from "../hooks/useOpenAuth";
import { CalendarVignette, CardsVignette } from "./illustrations/FeatureVignettes";
import { StripedSun } from "./illustrations/StripedSun";

/*
 * The home's sections below the hero. Each uses a different layout family, so the page never runs
 * more than two text-beside-picture blocks in a row: a full-width band (why), two alternating rows
 * (features), a split strip (currencies) and a closing band. Illustrations are decorative
 * (`aria-hidden`) and painted with theme tokens only; below `lg` everything stacks, copy first.
 * `reveal` is the scroll-driven entry from `styles/index.css` (a no-op without support or with
 * reduced motion).
 */

const P = "landing.home";

function SectionTitle({
  id,
  lead,
  accent,
  className,
}: Readonly<{ id: string; lead: string; accent?: string; className?: string }>) {
  return (
    <h2
      id={id}
      className={cn(
        "text-balance text-3xl font-bold leading-[1.05] tracking-tight sm:text-[2.75rem]",
        className,
      )}
    >
      {lead}
      {accent ? (
        <>
          {" "}
          <span className="text-primary">{accent}</span>
        </>
      ) : null}
    </h2>
  );
}

/** Why Cuadra: a full-width band, the striped sun beside the title and the three reasons in an
 * asymmetric row. The reasons aren't a sequence, so they carry a short rule, not a number. */
export function WhySection() {
  const { t } = useTranslation();
  return (
    // Edge to edge: the band breaks out of `main`'s column (the layout clips any horizontal
    // overflow), while its content goes back to the same 1240px column as everything else, so the
    // title lines up with the hero's copy.
    <section
      aria-labelledby="landing-why-title"
      className="relative left-1/2 w-screen -translate-x-1/2 border-y bg-surface2 py-14 lg:py-16"
    >
      <div className="mx-auto max-w-[1240px] px-4">
        {/* Title and sunset side by side at every width, centered on each other. The sunset is
            wide (240×132), so on a phone it keeps 8rem (narrower reads as a sliver) and the title
            steps down to 1.75rem to fit the remaining column in four lines. */}
        <div className="reveal grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:gap-8">
          <SectionTitle
            id="landing-why-title"
            lead={t(`${P}.why.title`)}
            className="max-w-[20ch] text-[1.75rem] sm:text-[2.75rem]"
          />
          <StripedSun className="w-32 justify-self-end sm:w-48 lg:w-60" />
        </div>
        {/* Phone: one column. Tablet: the lead reason across, the other two side by side.
            Desktop: the asymmetric row. */}
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr] lg:gap-10">
          {(["1", "2", "3"] as const).map((n) => (
            <li
              key={n}
              className={cn(
                "reveal relative flex flex-col gap-2 pt-5 before:absolute before:left-0 before:top-0 before:h-[3px] before:w-9 before:rounded-full before:bg-primary",
                n === "1" && "sm:col-span-2 lg:col-span-1",
              )}
            >
              <h3 className={cn("font-semibold", n === "1" ? "text-xl" : "text-lg")}>
                {t(`${P}.why.${n}.title`)}
              </h3>
              <p
                className={cn(
                  "max-w-[46ch] leading-relaxed text-muted-foreground",
                  n === "1" ? "text-base" : "text-[15px]",
                )}
              >
                {t(`${P}.why.${n}.body`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FEATURES = [
  { key: "cards", Art: CardsVignette },
  { key: "calendar", Art: CalendarVignette },
] as const;

/** Two alternating rows, each an illustrated vignette beside its explanation. */
export function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="landing-features-title"
      className="flex flex-col gap-16 py-16 lg:gap-24 lg:py-24"
    >
      <SectionTitle
        id="landing-features-title"
        lead={t(`${P}.features.titleLead`)}
        accent={t(`${P}.features.titleAccent`)}
        className="reveal max-w-3xl"
      />
      {FEATURES.map(({ key, Art }, index) => {
        const artFirst = index % 2 === 0;
        return (
          // Side by side from `md`: a tablet has the room, and a stacked vignette there ran the
          // width of the screen for a picture meant as a companion to the text.
          <div key={key} className="reveal grid items-center gap-8 md:grid-cols-12">
            <Art
              className={cn(
                "order-2 w-full md:order-none md:col-span-6",
                !artFirst && "md:col-start-7 md:row-start-1",
              )}
            />
            <div
              className={cn(
                "flex flex-col gap-3.5 md:col-span-6 lg:col-span-5",
                artFirst ? "md:col-start-7 lg:col-start-8" : "md:col-start-1 md:row-start-1",
              )}
            >
              <h3 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {t(`${P}.features.${key}.title`)}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {t(`${P}.features.${key}.body`)}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Sample totals, one per MVP currency; CLF shows the UF's four decimals, as the app does. */
const SAMPLE_TOTALS = [
  { currency: "CLP", amount: "1284350" },
  { currency: "USD", amount: "412.80" },
  { currency: "CLF", amount: "38.4120" },
] as const;

/** Currencies: copy beside three separate totals, so the rule shows instead of being described. */
export function CurrenciesStrip() {
  const { t, i18n } = useTranslation();
  return (
    <section
      aria-labelledby="landing-currencies-title"
      className="reveal grid gap-8 border-t py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center lg:gap-14 lg:py-20"
    >
      <div className="flex max-w-[52ch] flex-col gap-3.5">
        <SectionTitle id="landing-currencies-title" lead={t(`${P}.currencies.title`)} />
        <p className="text-base leading-relaxed text-muted-foreground">
          {t(`${P}.currencies.body`)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <ul className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {SAMPLE_TOTALS.map(({ currency, amount }) => (
            // Phone: a row per currency, label left and total right, like a statement line.
            // From `sm`: three tiles.
            <li
              key={currency}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 bg-card px-4 py-4 sm:flex sm:flex-col sm:items-start sm:gap-1.5 sm:p-5"
            >
              <span className="font-mono text-xs font-medium text-primary">{currency}</span>
              <span className="row-span-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
                {formatMoney(amount, { locale: i18n.language, currency })}
              </span>
              <span className="text-sm text-muted-foreground">
                {t(`${P}.currencies.items.${currency}`)}
              </span>
            </li>
          ))}
        </ul>
        <span className="self-end font-mono text-[11px] text-dim">
          {t(`${P}.currencies.sample`)}
        </span>
      </div>
    </section>
  );
}

/** The page's last word: the same sign-up as the hero, with a fact the visitor can act on. */
export function ClosingCta() {
  const { t } = useTranslation();
  const openAuth = useOpenAuth();
  return (
    <section aria-labelledby="landing-closing-title" className="pb-16 pt-4">
      <div className="reveal grid gap-6 rounded-2xl bg-primary px-6 py-8 text-primary-foreground sm:px-9 sm:py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-12 lg:py-12">
        <div className="flex flex-col gap-3">
          <h2
            id="landing-closing-title"
            className="max-w-[20ch] text-balance text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl"
          >
            {t(`${P}.closing.title`)}
          </h2>
          <p className="max-w-[46ch] text-base opacity-85">{t(`${P}.closing.body`)}</p>
        </div>
        <Button
          size="lg"
          className="h-12 w-full justify-self-start bg-background text-foreground hover:bg-background/90 sm:h-11 sm:w-auto"
          onClick={() => openAuth("register")}
        >
          {t("auth.createAccount")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
