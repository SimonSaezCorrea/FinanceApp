import { CreditCard, KeyRound, type LucideIcon, Plus, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { Eyebrow } from "../components/bits";
import { LandingLayout } from "../components/LandingLayout";
import { useOpenAuth } from "../hooks/useOpenAuth";

const P = "landing.faq";

/** Groups → question keys; each question lives at `landing.faq.items.<key>.{q,a}`. */
const GROUPS: { key: string; icon: LucideIcon; items: string[] }[] = [
  { key: "howItWorks", icon: Receipt, items: ["bankSync", "setup", "conversion", "investments"] },
  {
    key: "cardsBilling",
    icon: CreditCard,
    items: ["creditBalance", "closing", "partialPayment", "additionalCard", "interest"],
  },
  { key: "yourData", icon: KeyRound, items: ["signIn", "deleteAccount", "minors"] },
];

/**
 * "Preguntas frecuentes" (canvas "Cuadra · Preguntas frecuentes", option F1): from `lg`, a sticky
 * column with the title, a topic index and the sign-up card, beside the questions grouped by topic.
 * Below `lg` everything stacks and the sign-up card moves after the questions.
 */
export function FaqRoute() {
  return (
    <LandingLayout>
      <Faq />
    </LandingLayout>
  );
}

function Faq() {
  const { t } = useTranslation();

  return (
    <div className="grid gap-12 pb-20 pt-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-20 lg:pb-28 lg:pt-16">
      <aside className="flex flex-col gap-9 lg:sticky lg:top-24">
        <div className="flex flex-col gap-4">
          <Eyebrow className="text-accent">{t(`${P}.title`)}</Eyebrow>
          <h1
            tabIndex={-1}
            className="text-4xl font-bold leading-[1.02] tracking-tight focus:outline-none sm:text-5xl"
          >
            {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">{t(`${P}.subtitle`)}</p>
        </div>

        <nav aria-label={t(`${P}.topics`)} className="flex flex-col gap-1">
          {GROUPS.map(({ key, icon, items }) => (
            <a
              key={key}
              href={`#faq-${key}`}
              className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3.5 rounded-2xl border border-transparent p-3 text-[15px] font-medium transition-colors hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TopicIcon icon={icon} />
              {t(`${P}.groups.${key}`)}
              <span className="font-mono text-[13px] text-muted-foreground">{items.length}</span>
            </a>
          ))}
        </nav>

        <SignUpCard className="hidden lg:flex" />
      </aside>

      <div className="flex flex-col gap-16">
        {GROUPS.map(({ key, icon, items }) => (
          <section
            key={key}
            id={`faq-${key}`}
            aria-labelledby={`faq-${key}-title`}
            className="flex scroll-mt-24 flex-col gap-2"
          >
            <div className="mb-3 flex items-center gap-4">
              <TopicIcon icon={icon} large />
              <h2
                id={`faq-${key}-title`}
                className="text-2xl font-bold tracking-tight sm:text-[1.875rem]"
              >
                {t(`${P}.groups.${key}`)}
              </h2>
            </div>
            <div className="border-b">
              {items.map((item) => (
                <details key={item} className="group border-t">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_2rem] items-center gap-4 px-1 py-5 text-base font-semibold leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:text-lg [&::-webkit-details-marker]:hidden">
                    {t(`${P}.items.${item}.q`)}
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-[hsl(var(--ridge-line))] transition-transform group-open:rotate-45 group-open:bg-[hsl(var(--ridge-line))] group-open:text-background">
                      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </span>
                  </summary>
                  <p className="max-w-[68ch] px-1 pb-6 pr-14 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                    {t(`${P}.items.${item}.a`)}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}

        <SignUpCard className="flex lg:hidden" />
      </div>
    </div>
  );
}

function TopicIcon({ icon: Icon, large }: Readonly<{ icon: LucideIcon; large?: boolean }>) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-chip text-[hsl(var(--ridge-line))]",
        large ? "h-14 w-14 rounded-2xl" : "h-11 w-11 rounded-xl",
      )}
    >
      <Icon className={large ? "h-[26px] w-[26px]" : "h-[22px] w-[22px]"} aria-hidden />
    </span>
  );
}

function SignUpCard({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  const openAuth = useOpenAuth();
  return (
    <div className={cn("flex-col gap-3 rounded-2xl border bg-card p-6", className)}>
      <p className="text-[17px] font-semibold">{t(`${P}.cta.title`)}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t(`${P}.cta.body`)}</p>
      <Button variant="accent" size="lg" className="mt-1.5" onClick={() => openAuth("register")}>
        {t("auth.createAccount")}
      </Button>
    </div>
  );
}
