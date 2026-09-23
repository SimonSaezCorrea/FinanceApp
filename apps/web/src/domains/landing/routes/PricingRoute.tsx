import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardHeader } from "../../../shared/ui/card";
import { Eyebrow, PageIntro } from "../components/bits";
import { LandingLayout } from "../components/LandingLayout";
import { useOpenAuth } from "../hooks/useOpenAuth";

const P = "landing.pricing";
const INCLUDED = ["accounts", "movements", "billing", "security", "currencies"] as const;
const REASONS = ["whyFree", "notYourData", "changes"] as const;

export function PricingRoute() {
  return (
    <LandingLayout>
      <Pricing />
    </LandingLayout>
  );
}

function Pricing() {
  const { t } = useTranslation();
  const openAuth = useOpenAuth();

  return (
    <section className="flex flex-col gap-8 py-10">
      <PageIntro title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Card>
          <CardHeader>
            <Eyebrow>{t(`${P}.plan`)}</Eyebrow>
            <p className="text-4xl font-bold tracking-tight">{t(`${P}.free`)}</p>
            <p className="text-sm text-muted-foreground">{t(`${P}.freeHint`)}</p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {INCLUDED.map((key) => (
                <li key={key} className="flex items-center gap-3 py-2.5">
                  <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                  <span>{t(`${P}.included.${key}`)}</span>
                </li>
              ))}
            </ul>
            <Button variant="accent" className="mt-6 w-full" onClick={() => openAuth("register")}>
              {t(`${P}.cta`)}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          {REASONS.map((key) => (
            <div key={key}>
              <h2 className="text-base font-semibold tracking-tight">
                {t(`${P}.reasons.${key}.title`)}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{t(`${P}.reasons.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
