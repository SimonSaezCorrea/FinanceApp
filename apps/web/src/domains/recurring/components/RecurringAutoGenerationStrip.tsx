import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The informational strip from the handoff. Its right-hand "Último movimiento
 * generado" is omitted: this domain has no cron/link to `Transaction` (see
 * `RecurringDetailPanel`'s own note on the same gap) so there is no real
 * "last generated" date to show — and the copy itself ("se generan
 * automáticamente") describes a capability this app doesn't implement yet,
 * kept here only because dropping the whole strip would silently break the
 * handoff's literal layout for no functional gain.
 */
export function RecurringAutoGenerationStrip() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-4 rounded-[9.6px] border border-border bg-card p-[12px_18px] text-[13px] text-muted-foreground max-sm:flex-col max-sm:items-start">
      <span className="flex items-center gap-2">
        <Zap className="h-[15px] w-[15px] text-success" aria-hidden />
        {t("recurring.autoGeneration.message")}
      </span>
    </div>
  );
}
