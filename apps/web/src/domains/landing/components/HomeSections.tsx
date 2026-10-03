import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { CalendarVignette, CardsVignette, CoinsVignette } from "./illustrations/FeatureVignettes";
import { SunsetArch } from "./illustrations/SunsetArch";

/*
 * The home's illustrated sections (canvas series "E"): one hand-drawn illustration on one side,
 * informative copy on the other. Illustrations are decorative (`aria-hidden`) and painted with
 * theme tokens only; below `lg` each section stacks, copy first.
 */

const P = "landing.home";

function Eyebrow({ children, className }: Readonly<{ children: string; className?: string }>) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({
  id,
  lead,
  accent,
}: Readonly<{ id: string; lead: string; accent?: string }>) {
  return (
    <h2
      id={id}
      className="text-balance text-3xl font-bold leading-[1.05] tracking-tight sm:text-[2.75rem]"
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

/** E1 — why Cuadra: the sunset arch beside three numbered points. */
export function WhySection() {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="landing-why-title"
      className="grid items-center gap-12 py-16 lg:grid-cols-12 lg:gap-8 lg:py-24"
    >
      <SunsetArch className="order-2 mx-auto w-full max-w-md lg:order-1 lg:col-span-5 lg:max-w-none" />
      <div className="flex flex-col gap-9 lg:order-2 lg:col-span-6 lg:col-start-7">
        <div className="flex flex-col gap-4">
          <Eyebrow className="text-accent">{t(`${P}.why.eyebrow`)}</Eyebrow>
          <SectionTitle id="landing-why-title" lead={t(`${P}.why.title`)} />
        </div>
        <ol className="flex flex-col gap-6">
          {(["1", "2", "3"] as const).map((n) => (
            <li key={n} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-5">
              <span className="font-mono text-4xl font-bold leading-none tracking-tight text-primary">
                0{n}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-semibold">{t(`${P}.why.${n}.title`)}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {t(`${P}.why.${n}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FEATURES = [
  { key: "cards", Art: CardsVignette },
  { key: "calendar", Art: CalendarVignette },
  { key: "currencies", Art: CoinsVignette },
] as const;

/** E2 — three alternating rows, each an illustrated vignette beside its explanation. */
export function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="landing-features-title"
      className="flex flex-col gap-16 py-16 lg:gap-24 lg:py-24"
    >
      <div className="flex max-w-3xl flex-col gap-3.5">
        <Eyebrow>{t(`${P}.features.eyebrow`)}</Eyebrow>
        <SectionTitle
          id="landing-features-title"
          lead={t(`${P}.features.titleLead`)}
          accent={t(`${P}.features.titleAccent`)}
        />
      </div>
      {FEATURES.map(({ key, Art }, index) => {
        const artFirst = index % 2 === 0;
        return (
          <div key={key} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-8">
            <Art
              className={cn(
                "order-2 w-full lg:order-none lg:col-span-6",
                !artFirst && "lg:col-start-7 lg:row-start-1",
              )}
            />
            <div
              className={cn(
                "flex flex-col gap-3.5 lg:col-span-5",
                artFirst ? "lg:col-start-8" : "lg:col-start-1 lg:row-start-1",
              )}
            >
              <span className="font-mono text-base font-medium tracking-wide text-primary sm:text-lg">
                0{index + 1} · {t(`${P}.features.${key}.tag`)}
              </span>
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
