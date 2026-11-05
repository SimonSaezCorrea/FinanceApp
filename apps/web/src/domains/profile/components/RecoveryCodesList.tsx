import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@finance/ui/src/shared/ui/button";

/**
 * The recovery codes as they are shown, exactly once (activation and regeneration, specs/021 and
 * specs/040): the grid, "Copiar todos" and a plain-text download, so they can be saved before the
 * panel closes for good.
 */
export function RecoveryCodesList({ codes }: Readonly<{ codes: string[] }>) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  function handleCopyAll() {
    void navigator.clipboard.writeText(codes.join("\n")).then(() => {
      setCopied(true);
      toast.success(t("profile.security.mfa.codesCopied"));
    });
  }

  function handleDownload() {
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = t("profile.security.mfa.codesFileName");
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-4 font-mono text-sm"
        data-testid="recovery-codes"
      >
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={handleCopyAll} className="flex-1 gap-2">
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {t("profile.security.mfa.copyAll")}
        </Button>
        <Button type="button" variant="outline" onClick={handleDownload} className="flex-1 gap-2">
          <Download className="h-4 w-4" aria-hidden />
          {t("profile.security.mfa.download")}
        </Button>
      </div>
    </div>
  );
}
