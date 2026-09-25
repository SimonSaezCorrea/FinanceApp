import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Eyebrow } from "../components/bits";
import { LayerRings, PrivacyRings } from "../components/illustrations/PrivacyRings";
import { LandingLayout } from "../components/LandingLayout";

const P = "landing.privacy";

/** The five layers, inside out — the order is the numbering and matches the rings. */
const LAYERS = ["consent", "access", "sessions", "visible", "leave"] as const;
const DONT = ["cardNumber", "estimates", "banks"] as const;

/**
 * "Privacidad y datos" (canvas "Cuadra · Privacidad y datos", option P3): your data at the centre
 * of five rings, then one row per layer — a mini copy of the rings with that layer lit, what the
 * layer does, and how it shows up in the app — and what the app doesn't do.
 */
export function PrivacyRoute() {
  const { t } = useTranslation();
  const isLast = (index: number) => index === LAYERS.length - 1;

  return (
    <LandingLayout>
      <div className="flex flex-col gap-24 pb-20 pt-10 lg:gap-28 lg:pb-28 lg:pt-16">
        <section className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <PrivacyRings
            centerLabel={t(`${P}.center`)}
            className="order-2 mx-auto w-full max-w-md lg:order-1 lg:col-span-5 lg:max-w-none"
          />
          <div className="flex flex-col gap-7 lg:order-2 lg:col-span-6 lg:col-start-7">
            <div className="flex flex-col gap-4">
              <Eyebrow className="text-accent">{t(`${P}.title`)}</Eyebrow>
              <h1
                tabIndex={-1}
                className="text-4xl font-bold leading-[1.02] tracking-tight focus:outline-none sm:text-[3.5rem]"
              >
                {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-[17px]">
                {t(`${P}.lead`)}
              </p>
            </div>
            <ol className="flex flex-col border-b">
              {LAYERS.map((key, index) => (
                <li
                  key={key}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-4 border-t py-3.5"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-[2.5px] font-mono text-[13px]",
                      isLast(index)
                        ? "border-accent text-accent"
                        : "border-[hsl(var(--ridge-line))]",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="text-lg font-semibold">{t(`${P}.layers.${key}.title`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="privacy-layers-title" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Eyebrow>{t(`${P}.layersEyebrow`)}</Eyebrow>
            <h2
              id="privacy-layers-title"
              className="text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl"
            >
              {t(`${P}.layersTitle`)}
            </h2>
          </div>
          <ol className="flex flex-col border-b border-border2">
            {LAYERS.map((key, index) => (
              <li
                key={key}
                className="grid gap-6 border-t border-border2 py-9 md:grid-cols-[5.5rem_minmax(0,4fr)_minmax(0,7fr)] md:gap-9"
              >
                <LayerRings active={index} className="h-16 w-16 md:h-[5.5rem] md:w-[5.5rem]" />
                <div className="flex flex-col gap-2.5">
                  <span
                    className={cn(
                      "font-mono text-[13px] font-bold uppercase",
                      isLast(index) ? "text-accent" : "text-[hsl(var(--ridge-line))]",
                    )}
                  >
                    {t(`${P}.layerLabel`, { n: index + 1 })}
                  </span>
                  <h3 className="text-2xl font-bold leading-tight tracking-tight">
                    {t(`${P}.layers.${key}.title`)}
                  </h3>
                  <p className="text-[15.5px] leading-relaxed text-muted-foreground">
                    {t(`${P}.layers.${key}.lead`)}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["a", "b"] as const).map((detail) => (
                    <div
                      key={detail}
                      className="flex flex-col gap-1.5 rounded-2xl border bg-card px-5 py-[1.125rem]"
                    >
                      <strong className="text-base font-semibold">
                        {t(`${P}.layers.${key}.${detail}.title`)}
                      </strong>
                      <span className="text-[14.5px] leading-relaxed text-muted-foreground">
                        {t(`${P}.layers.${key}.${detail}.body`)}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-label={t(`${P}.dont.title`)}
          className="grid overflow-hidden rounded-3xl border border-dashed border-border2 md:grid-cols-3"
        >
          {DONT.map((key, index) => (
            <div
              key={key}
              className={cn(
                "flex flex-col gap-2 p-8",
                index > 0 && "border-t border-dashed border-border2 md:border-l md:border-t-0",
              )}
            >
              <span className="font-mono text-xs uppercase text-destructive">
                {t(`${P}.dont.${key}.tag`)}
              </span>
              <h3 className="text-lg font-semibold">{t(`${P}.dont.${key}.title`)}</h3>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                {t(`${P}.dont.${key}.body`)}
              </p>
            </div>
          ))}
        </section>
      </div>
    </LandingLayout>
  );
}
