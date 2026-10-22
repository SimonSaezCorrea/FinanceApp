import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface HomeSimulatorProps {
  /** The simulator page in this language. */
  link: string;
  /** The example the page is built with, already written for the language. */
  example: { price: string; count: number; rate: string; payment: string };
}

/**
 * The home's block for the installment simulator (spec 034, FR-017): a short pitch and the solved
 * example, linking to the page. Rendered at build time only, never hydrated.
 */
export function HomeSimulator({ link, example }: Readonly<HomeSimulatorProps>) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="landing-simulator-title"
      className="reveal grid gap-6 border-t py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center lg:gap-14 lg:py-20"
    >
      <div className="flex max-w-[52ch] flex-col gap-3.5">
        <h2
          id="landing-simulator-title"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {t("landing.simulator.home.title")}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("landing.simulator.home.body")}
        </p>
      </div>
      <a
        href={link}
        className="group flex flex-col gap-2 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50 sm:p-6"
      >
        <span className="text-sm text-muted-foreground">
          {t("landing.simulator.home.example", example)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          {t("landing.simulator.home.see")}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </a>
    </section>
  );
}
