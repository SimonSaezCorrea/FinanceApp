import { useTranslation } from "react-i18next";

import { Eyebrow } from "../components/bits";
import { LandingLayout } from "../components/LandingLayout";

const PRINCIPLES = ["reviewable", "noInvented", "reversible", "chileFirst"] as const;

export function AboutRoute() {
  const { t } = useTranslation();

  return (
    <LandingLayout>
      <section className="flex flex-col gap-10 py-10">
        <div className="max-w-[62ch]">
          <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
            {t("landing.about.title")}
          </h1>
          <p className="mt-4 text-base text-muted-foreground">{t("landing.about.p1")}</p>
          <p className="mt-4 text-base text-muted-foreground">{t("landing.about.p2")}</p>
        </div>

        <div>
          <Eyebrow>{t("landing.about.principlesTitle")}</Eyebrow>
          <div className="mt-5 grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {PRINCIPLES.map((key) => (
              <div key={key}>
                <h2 className="text-base font-semibold tracking-tight">
                  {t(`landing.about.principles.${key}.title`)}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(`landing.about.principles.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-[62ch] border-t pt-8">
          <h2 className="text-base font-semibold tracking-tight">
            {t("landing.about.todayTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("landing.about.todayBody")}</p>
        </div>
      </section>
    </LandingLayout>
  );
}
