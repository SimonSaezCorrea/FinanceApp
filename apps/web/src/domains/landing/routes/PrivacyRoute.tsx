import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui/card";
import { InfoCard, PageIntro } from "../components/bits";
import { useSampleFormat } from "../hooks/useSampleFormat";
import { LandingLayout } from "../components/LandingLayout";

const P = "landing.privacy";

export function PrivacyRoute() {
  const { t } = useTranslation();
  const f = useSampleFormat();

  return (
    <LandingLayout>
      <section className="flex flex-col gap-8 py-10">
        <PageIntro title={t(`${P}.title`)} description={t(`${P}.subtitle`)} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-12">
          <div className="flex flex-col gap-5">
            <p className="text-base text-muted-foreground">{t(`${P}.p1`)}</p>
            <p className="text-base text-muted-foreground">{t(`${P}.p2`)}</p>

            <Card>
              <CardHeader>
                <CardTitle>{t(`${P}.sessions.title`)}</CardTitle>
                <p className="text-sm text-muted-foreground">{t(`${P}.sessions.subtitle`)}</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col divide-y">
                  <SessionRow
                    device="Chrome · Windows"
                    detail={t(`${P}.sessions.activeNow`)}
                    aside={<Badge variant="brand">{t(`${P}.sessions.current`)}</Badge>}
                  />
                  <SessionRow
                    device="Safari · iPhone"
                    detail={t(`${P}.sessions.daysAgo`, { count: 2 })}
                    aside={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        title={t("landing.sampleAction")}
                      >
                        {t(`${P}.sessions.close`)}
                      </Button>
                    }
                  />
                  <SessionRow
                    device="Firefox · Windows"
                    detail={t(`${P}.sessions.closedOn`, { date: f.dayMonth("2026-09-18") })}
                    closed
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{t(`${P}.sessions.note`)}</p>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {(["passkey", "mfa", "deletion", "minors"] as const).map((key) => (
                <InfoCard key={key} title={t(`${P}.security.${key}.title`)}>
                  {t(`${P}.security.${key}.body`)}
                </InfoCard>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t(`${P}.dont.title`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col divide-y">
                  {(["banks", "cardNumber", "estimates"] as const).map((key) => (
                    <div key={key} className="py-3">
                      <p className="text-sm font-medium">{t(`${P}.dont.${key}.title`)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(`${P}.dont.${key}.body`)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <InfoCard title={t(`${P}.attachments.title`)}>{t(`${P}.attachments.body`)}</InfoCard>
            <InfoCard title={t(`${P}.hideBalances.title`)}>{t(`${P}.hideBalances.body`)}</InfoCard>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}

function SessionRow({
  device,
  detail,
  aside,
  closed,
}: Readonly<{ device: string; detail: string; aside?: ReactNode; closed?: boolean }>) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", closed && "opacity-60")}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{device}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
