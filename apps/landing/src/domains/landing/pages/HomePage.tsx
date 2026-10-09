import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { HERO_TITLE } from "../components/bits";
import { HeroRidge } from "../components/HeroRidge";
import {
  ClosingCta,
  CurrenciesStrip,
  FeaturesSection,
  WhySection,
} from "../components/HomeSections";
import { AccessLink } from "../components/AccessLink";

/** Public home: what the app is, a cordillera that doubles as a balance chart, then why Cuadra
 * (a full-width band), what sets it apart (two illustrated rows), one total per currency, and a
 * closing sign-up. */
export function HomePage() {
  return (
    <>
      <LandingHome />
    </>
  );
}

function LandingHome() {
  const { t } = useTranslation();

  return (
    <>
      <section aria-labelledby="landing-home-title">
        {/* From `lg` the ridge sits BEHIND the copy, anchored to the hero's bottom and stretched to
            the viewport less a 4rem margin per side (the massif is low on the left, where the text is);
            below that it follows the copy as a block of its own, at its drawn proportions. */}
        <div className="relative lg:flex lg:min-h-[44rem] lg:items-center">
          <HeroRidge className="absolute bottom-0 left-1/2 hidden h-[26rem] w-[calc(100vw-8rem)] -translate-x-1/2 lg:block" />
          <div className="relative max-w-xl py-10 lg:-mt-24 lg:py-16">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("landing.home.eyebrow")}
            </span>
            <h1 id="landing-home-title" tabIndex={-1} className={cn("mt-4", HERO_TITLE)}>
              {t("landing.home.titleLead")}
              <br />
              <span className="text-primary">{t("landing.home.titleAccent")}</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-base text-muted-foreground sm:text-lg">
              {t("landing.home.lead")}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Full width on a phone: the one action of the hero, under the thumb. */}
              <AccessLink mode="registro" size="lg" className="h-12 w-full sm:h-11 sm:w-auto">
                {t("auth.createAccount")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </AccessLink>
            </div>
          </div>

          <HeroRidge className="-mx-4 aspect-[1440/528] w-[calc(100%+2rem)] lg:hidden" />
        </div>
      </section>

      <WhySection />

      <FeaturesSection />

      <CurrenciesStrip />

      <ClosingCta />
    </>
  );
}
