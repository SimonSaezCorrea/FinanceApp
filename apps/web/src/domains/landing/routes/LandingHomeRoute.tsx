import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { HeroRidge } from "../components/HeroRidge";
import { FeaturesSection, WhySection } from "../components/HomeSections";
import { LandingLayout } from "../components/LandingLayout";
import { useOpenAuth } from "../hooks/useOpenAuth";

/** Public home: what the app is, a cordillera that doubles as a balance chart, then why Cuadra
 * (sunset arch) and what sets it apart (three illustrated rows). */
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

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="accent" size="lg" onClick={() => openAuth("register")}>
                {t("auth.createAccount")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <HeroRidge className="-mx-4 aspect-[1440/528] w-[calc(100%+2rem)] lg:hidden" />
        </div>
      </section>

      <WhySection />

      <FeaturesSection />
    </>
  );
}
