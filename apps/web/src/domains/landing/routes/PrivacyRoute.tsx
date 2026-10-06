import { ArrowDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HERO_TITLE } from "../components/bits";
import { ClosingCta } from "../components/HomeSections";
import { LayerRings, PrivacyRings } from "../components/illustrations/PrivacyRings";
import { LandingLayout } from "../components/LandingLayout";

const P = "landing.privacy";

/** The five layers, inside out. Here the order IS information (it's the rings, centre outwards),
 * so the numbers stay. */
const LAYERS = ["consent", "access", "sessions", "visible", "leave"] as const;
const DONT = ["cardNumber", "estimates", "banks"] as const;

const layerId = (key: string) => `privacy-layer-${key}`;

/**
 * "Privacidad y datos": your data at the centre of five rings beside an index that jumps to each
 * layer, then one row per layer (a mini copy of the rings with that layer lit, what it does, and
 * two details), what the app doesn't do, and the closing sign-up.
 */
export function PrivacyRoute() {
  const { t } = useTranslation();

  return (
    <LandingLayout>
      <div className="flex flex-col gap-16 pb-4 pt-8 sm:gap-24 sm:pt-10 lg:gap-28 lg:pt-16">
        {/* Three pieces placed per width. Phone: copy, rings, index stacked. Tablet: copy
            across, then the rings beside the index they number. Desktop: the rings on the left
            spanning both rows, copy and index on the right. */}
        <section className="grid items-center gap-8 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-x-10 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-7">
          <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:self-end">
            <h1 tabIndex={-1} className={HERO_TITLE}>
              {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              {t(`${P}.lead`)}
            </p>
          </div>
          <PrivacyRings
            centerLabel={t(`${P}.center`)}
            className="mx-auto w-full max-w-[15rem] md:max-w-none lg:col-span-5 lg:col-start-1 lg:row-span-2 lg:row-start-1"
          />
          <div className="lg:col-span-6 lg:col-start-7 lg:row-start-2 lg:self-start">
            <nav aria-label={t(`${P}.layersIndex`)}>
              <ol className="flex flex-col border-b">
                {LAYERS.map((key, index) => (
                  <li key={key} className="border-t">
                    <a
                      href={`#${layerId(key)}`}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-md px-1 py-3.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border-[2.5px] border-[hsl(var(--ridge-line))] font-mono text-[13px]">
                        {index + 1}
                      </span>
                      <span className="text-lg font-semibold">{t(`${P}.layers.${key}.title`)}</span>
                      <ArrowDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        <section aria-labelledby="privacy-layers-title" className="flex flex-col gap-8">
          <h2
            id="privacy-layers-title"
            className="reveal text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl"
          >
            {t(`${P}.layersTitle`)}
          </h2>
          <ol className="flex flex-col border-b border-border2">
            {LAYERS.map((key, index) => (
              <li
                key={key}
                id={layerId(key)}
                // Phone: the mini rings beside the title, details full width below. Tablet: the
                // rings in their own column, text and details stacked beside them. Desktop: three
                // columns.
                className="reveal grid scroll-mt-[calc(var(--landing-header,4.5rem)+1rem)] grid-cols-[3rem_minmax(0,1fr)] gap-x-4 gap-y-5 border-t border-border2 py-8 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-x-7 md:py-9 lg:grid-cols-[5.5rem_minmax(0,4fr)_minmax(0,7fr)] lg:gap-9"
              >
                <LayerRings
                  active={index}
                  className="h-12 w-12 md:h-[4.5rem] md:w-[4.5rem] lg:h-[5.5rem] lg:w-[5.5rem]"
                />
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2.5">
                    <span aria-hidden className="font-mono text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <h3 className="text-2xl font-bold leading-tight tracking-tight">
                      {t(`${P}.layers.${key}.title`)}
                    </h3>
                  </div>
                  <p className="text-[15.5px] leading-relaxed text-muted-foreground">
                    {t(`${P}.layers.${key}.lead`)}
                  </p>
                </div>
                <div className="col-span-2 grid gap-5 sm:grid-cols-2 md:col-span-1 md:col-start-2 lg:col-start-auto">
                  {(["a", "b"] as const).map((detail) => (
                    <div
                      key={detail}
                      className="flex flex-col gap-1 border-l-2 border-border2 pl-4"
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
          aria-labelledby="privacy-dont-title"
          className="reveal flex flex-col gap-7 rounded-2xl border bg-card p-6 sm:p-10"
        >
          <h2
            id="privacy-dont-title"
            className="text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl"
          >
            {t(`${P}.dont.title`)}
          </h2>
          {/* Rows until `lg`: three columns on a tablet squeezed each answer into a sliver. */}
          <ul className="grid gap-6 lg:grid-cols-3 lg:gap-8">
            {DONT.map((key) => (
              <li key={key} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3.5 gap-y-1">
                <span className="row-span-2 flex h-8 w-8 items-center justify-center rounded-full bg-chip text-muted-foreground">
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{t(`${P}.dont.${key}.title`)}</h3>
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                  {t(`${P}.dont.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <ClosingCta />
      </div>
    </LandingLayout>
  );
}
