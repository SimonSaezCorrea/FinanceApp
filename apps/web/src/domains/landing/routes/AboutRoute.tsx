import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Eyebrow } from "../components/bits";
import { MatchingReceipts } from "../components/illustrations/MatchingReceipts";
import { paint } from "../components/illustrations/paint";
import { LandingLayout } from "../components/LandingLayout";

const P = "landing.about";

/** Order is the numbering (01, 02, 03); the last one wears the accent. */
const PRINCIPLES = ["noInvented", "reversible", "chileFirst"] as const;

const STATUS = [
  { key: "available", dot: "bg-[hsl(var(--ridge-line))]", card: "border bg-card sm:col-span-2" },
  { key: "paused", dot: "bg-accent", card: "border border-dashed border-border2" },
  {
    key: "pending",
    dot: "border-2 border-muted-foreground",
    card: "border border-dashed border-border2",
  },
] as const;

/**
 * "Nosotros" (canvas combination N1 + N2): the two receipts that cuadran, the founding idea on a
 * ridge band, three numbered rules, and an honest status board of what exists today.
 */
export function AboutRoute() {
  const { t } = useTranslation();

  return (
    <LandingLayout>
      <div className="flex flex-col gap-24 pb-20 pt-10 lg:gap-32 lg:pb-28 lg:pt-16">
        <section className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col gap-6 lg:col-span-6">
            <Eyebrow className="text-accent">{t(`${P}.eyebrow`)}</Eyebrow>
            <h1
              tabIndex={-1}
              className="text-4xl font-bold leading-none tracking-tight focus:outline-none sm:text-6xl"
            >
              {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
            </h1>
            <p className="text-lg leading-relaxed text-foreground/85">{t(`${P}.lead`)}</p>
            <p className="text-base leading-relaxed text-muted-foreground">{t(`${P}.p1`)}</p>
          </div>
          <MatchingReceipts
            bankLabel={t(`${P}.receipts.bank`)}
            appLabel={t("brand.name")}
            className="mx-auto w-full max-w-md lg:col-span-5 lg:col-start-8 lg:max-w-none"
          />
        </section>

        <section
          aria-labelledby="about-how-title"
          className="relative overflow-hidden rounded-3xl border bg-card px-6 pb-36 pt-10 sm:px-12 sm:pt-14 lg:px-20 lg:pt-[4.5rem]"
        >
          <RidgeBand />
          <div className="relative flex max-w-3xl flex-col gap-5">
            <Eyebrow>{t(`${P}.how.eyebrow`)}</Eyebrow>
            <h2
              id="about-how-title"
              className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-[2.5rem]"
            >
              {t(`${P}.how.titleLead`)}{" "}
              <span className="text-primary">{t(`${P}.how.titleAccent`)}</span>
            </h2>
            <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              {t(`${P}.how.body`)}
            </p>
          </div>
        </section>

        <section aria-labelledby="about-principles-title" className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Eyebrow>{t(`${P}.principlesTitle`)}</Eyebrow>
            <h2
              id="about-principles-title"
              className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-[2.5rem]"
            >
              {t(`${P}.principlesHeading`)}
            </h2>
          </div>
          <ol className="flex flex-col border-b border-border2">
            {PRINCIPLES.map((key, index) => (
              <li
                key={key}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-5 gap-y-3 border-t border-border2 py-8 md:grid-cols-[6rem_minmax(0,2fr)_minmax(0,3fr)] md:gap-x-10"
              >
                <span
                  className={cn(
                    "font-mono text-4xl font-bold leading-none md:text-5xl",
                    index === PRINCIPLES.length - 1 ? "text-accent" : "text-primary",
                  )}
                >
                  0{index + 1}
                </span>
                <h3 className="text-xl font-bold leading-tight tracking-tight md:text-[1.75rem]">
                  {t(`${P}.principles.${key}.title`)}
                </h3>
                <p className="col-start-2 text-[15px] leading-relaxed text-muted-foreground md:col-start-3 md:text-base">
                  {t(`${P}.principles.${key}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="about-today-title" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>{t(`${P}.today.eyebrow`)}</Eyebrow>
            <h2
              id="about-today-title"
              className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-[2.5rem]"
            >
              {t(`${P}.today.title`)}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-4">
            {STATUS.map(({ key, dot, card }) => (
              <div key={key} className={cn("flex flex-col gap-4 rounded-2xl p-7", card)}>
                <span className="flex items-center gap-2.5 text-[15px] font-semibold">
                  <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", dot)} />
                  {t(`${P}.today.${key}.title`)}
                </span>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {t(`${P}.today.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </section>
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
