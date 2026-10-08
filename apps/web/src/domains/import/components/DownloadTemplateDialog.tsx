import { Check, FileSpreadsheet, Info, Sheet } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { FormSurface } from "../../../shared/ui/overlay";

export type TemplateContent = "empty" | "prefilled";

const OPTIONS: { value: TemplateContent; icon: typeof Sheet }[] = [
  { value: "empty", icon: Sheet },
  { value: "prefilled", icon: FileSpreadsheet },
];

/**
 * "Descargar plantilla": empty, or pre-filled with what the user already has. A
 * pre-filled one is safe to upload again — its rows carry their "ID Cuadra" and
 * are skipped — so only the rows added below them get imported.
 */
export function DownloadTemplateDialog({
  open,
  onOpenChange,
  downloading,
  onDownload,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloading: boolean;
  onDownload: (content: TemplateContent) => void;
}>) {
  const { t } = useTranslation();
  const [content, setContent] = useState<TemplateContent>("empty");

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={t("import.template.downloadTitle")}
      description={t("import.template.downloadDescription")}
      submitLabel={
        downloading ? t("import.template.downloading") : t("import.template.downloadSubmit")
      }
      submitting={downloading}
      onSubmit={() => onDownload(content)}
    >
      {/* The chrome drops its bottom padding above a footer; keep the cards'
          borders (and focus rings) off the footer's rule. */}
      <div className="flex flex-col gap-4 pb-5">
        <div
          role="radiogroup"
          aria-label={t("import.template.downloadTitle")}
          className="grid gap-3 sm:grid-cols-2"
        >
          {OPTIONS.map(({ value, icon: Icon }) => {
            const selected = content === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setContent(value)}
                className={cn(
                  "relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border2 hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    selected ? "bg-primary/15 text-primary" : "bg-chip text-muted-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border2",
                  )}
                >
                  {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {t(`import.template.content.${value}.title`)}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {t(`import.template.content.${value}.hint`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {content === "prefilled" ? (
          <p className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
            {t("import.template.content.prefilled.note")}
          </p>
        ) : null}
      </div>
    </FormSurface>
  );
}
