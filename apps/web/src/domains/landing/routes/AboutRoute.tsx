import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Eyebrow, HERO_TITLE } from "../components/bits";
import { ClosingCta } from "../components/HomeSections";
import { MatchingReceipts } from "../components/illustrations/MatchingReceipts";
import { paint } from "../components/illustrations/paint";
import { LandingLayout } from "../components/LandingLayout";

const P = "landing.about";

/** Not a sequence, so no numbers: each rule is a title beside its explanation and a concrete case
 * from the app, the one thing this page adds over the home's "por qué Cuadra". */
const PRINCIPLES = ["noInvented", "reversible", "chileFirst"] as const;

/** The dot is a real state (available / paused / pending), the one case a colored dot earns. */
const STATUS = [
  { key: "available", dot: "bg-[hsl(var(--ridge-line))]", card: "bg-card" },
  { key: "paused", dot: "bg-accent", card: "bg-surface2" },
  { key: "pending", dot: "border-2 border-muted-foreground", card: "bg-surface2" },
] as const;

const H2 = "text-3xl font-bold leading-[1.1] tracking-tight sm:text-[2.5rem]";

/**
 * "Nosotros": the two receipts that cuadran beside the problem, the founding idea on a ridge
 * card, three rules with an example each, an honest status board of what exists today, and the
 * same closing sign-up as the home.
 */
export function AboutRoute() {
  const { t } = useTranslation();

  return (
    <LandingLayout>
      <div className="flex flex-col gap-16 pb-4 pt-8 sm:gap-24 sm:pt-10 lg:gap-32 lg:pt-16">
        <section className="grid items-center gap-10 md:grid-cols-12 md:gap-8">
          <div className="flex flex-col gap-6 md:col-span-7 lg:col-span-6">
            <h1 tabIndex={-1} className={HERO_TITLE}>
              {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
            </h1>
            <p className="max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
              {t(`${P}.lead`)}
            </p>
          </div>
          <MatchingReceipts
            bankLabel={t(`${P}.receipts.bank`)}
            appLabel={t("brand.name")}
            className="mx-auto w-full max-w-md md:col-span-5 md:max-w-none lg:col-start-8"
          />
        </section>

        <section
          aria-labelledby="about-how-title"
          className="reveal relative overflow-hidden rounded-2xl border bg-card px-6 pb-28 pt-9 sm:px-12 sm:pb-36 sm:pt-14 lg:px-20 lg:pt-[4.5rem]"
        >
          <RidgeBand />
          <div className="relative flex max-w-3xl flex-col gap-5">
            <Eyebrow>{t(`${P}.how.eyebrow`)}</Eyebrow>
            <h2 id="about-how-title" className={H2}>
              {t(`${P}.how.titleLead`)}{" "}
              <span className="text-primary">{t(`${P}.how.titleAccent`)}</span>
            </h2>
            <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              {t(`${P}.how.body`)}
            </p>
          </div>
        </section>

        <section aria-labelledby="about-principles-title" className="flex flex-col gap-10">
          <h2 id="about-principles-title" className={cn("reveal", H2)}>
            {t(`${P}.principlesHeading`)}
          </h2>
          <ul className="flex flex-col border-b border-border2">
            {PRINCIPLES.map((key) => (
              <li
                key={key}
                className="reveal grid gap-x-10 gap-y-3 border-t border-border2 py-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
              >
                <h3 className="text-xl font-bold leading-tight tracking-tight md:text-[1.75rem]">
                  {t(`${P}.principles.${key}.title`)}
                </h3>
                <div className="flex flex-col gap-4">
                  <p className="text-[15px] leading-relaxed text-muted-foreground md:text-base">
                    {t(`${P}.principles.${key}.body`)}
                  </p>
                  <p className="flex flex-col gap-1 border-l-2 border-primary pl-4 text-[15px] leading-relaxed">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {t(`${P}.inTheApp`)}
                    </span>
                    {t(`${P}.principles.${key}.example`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-today-title" className="flex flex-col gap-8">
          <h2 id="about-today-title" className={cn("reveal", H2)}>
            {t(`${P}.today.title`)}
          </h2>
          {/* Three columns only from `lg`: at tablet width the two small ones wrapped every line.
              In between, "available" spans the row and the other two share the next. */}
          <div className="reveal grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-[2fr_1fr_1fr]">
            {STATUS.map(({ key, dot, card }) => (
              <div
                key={key}
                className={cn(
                  "flex flex-col gap-4 rounded-2xl border p-6 sm:p-7",
                  key === "available" && "sm:col-span-2 lg:col-span-1",
                  card,
                )}
              >
                <span className="inline-flex items-center gap-2 self-start rounded-full border border-border2 bg-background py-1 pl-2.5 pr-3 text-sm font-semibold">
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", dot)} />
                  {t(`${P}.today.${key}.title`)}
                </span>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {t(`${P}.today.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <ClosingCta />
      </div>
    </LandingLayout>
  );
}

/** The cordillera along the foot of the "how we built it" card. Decorative. */
function RidgeBand() {
  const id = useId().replaceAll(":", "");
  const ridge =
    "0,170 120,150 240,158 380,110 460,124 560,70 620,52 680,76 780,104 900,90 1020,120 1120,100 1200,112";
  return (
    <svg
      viewBox="0 0 1200 180"
      preserveAspectRatio="none"
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-44 w-full"
    >
      <defs>
        <linearGradient id={`${id}-band`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("ridge-shade") }} />
          <stop offset="1" style={{ stopColor: paint("card") }} />
        </linearGradient>
      </defs>
      <polygon points={`${ridge} 1200,180 0,180`} fill={`url(#${id}-band)`} />
      <polyline
        points={ridge}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: paint("ridge-line", 0.5) }}
      />
    </svg>
  );
}
