import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { Eyebrow, PageIntro } from "../components/bits";
import { LandingLayout } from "../components/LandingLayout";
import { useOpenAuth } from "../hooks/useOpenAuth";

const P = "landing.faq";

/** Groups → question keys; each question lives at `landing.faq.items.<key>.{q,a}`. */
const GROUPS = {
  howItWorks: ["bankSync", "setup", "conversion", "investments"],
  cardsBilling: ["creditBalance", "closing", "partialPayment", "additionalCard", "interest"],
  yourData: ["signIn", "deleteAccount", "minors"],
} as const;

export function FaqRoute() {
  return (
    <LandingLayout>
      <Faq />
    </LandingLayout>
  );
}

function Faq() {
  const { t } = useTranslation();
  const openAuth = useOpenAuth();

  return (
    <section className="flex flex-col gap-8 py-10">
      <div className="max-w-3xl">
        <PageIntro title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />
      </div>

      <div className="flex max-w-3xl flex-col gap-8">
        {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((group, groupIndex) => (
          <div key={group} className="flex flex-col gap-3">
            <Eyebrow>{t(`${P}.groups.${group}`)}</Eyebrow>
            <Card className="divide-y overflow-hidden">
              {GROUPS[group].map((key, i) => (
                <details
                  key={key}
                  open={groupIndex === 0 && i === 0}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <summary className="flex w-full cursor-pointer list-none items-center gap-4 px-5 py-4 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{t(`${P}.items.${key}.q`)}</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="max-w-[68ch] px-5 pb-5 pr-12 text-sm leading-relaxed text-muted-foreground">
                    {t(`${P}.items.${key}.a`)}
                  </div>
                </details>
              ))}
            </Card>
          </div>
        ))}

        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t(`${P}.cta.title`)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t(`${P}.cta.body`)}</p>
          </div>
          <Button variant="accent" onClick={() => openAuth("register")}>
            {t("auth.createAccount")}
          </Button>
        </Card>
      </div>
    </section>
  );
}
