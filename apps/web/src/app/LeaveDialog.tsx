import { ExternalLink, Globe, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { withBrand } from "@finance/ui/src/shared/lib/brand";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { Modal } from "@finance/ui/src/shared/ui/overlay";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { landingHomeUrl } from "../shared/lib/landingUrl";

/** Both choices share one row shape: icon in a circle, label and hint, the same height. */
const OPTION =
  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const ICON = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full";

/**
 * What the shell's exit button opens: go to the public site (mifik.cl, in the person's language,
 * in a NEW tab — the session stays as it is, and the site shows "Ir a la app" while it lasts) or
 * really sign out. Leaving the app doesn't have to mean ending the session. No footer: the close
 * control, Escape and the backdrop already cancel, and a footer would sit flush on the last choice.
 */
export function LeaveDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-md"
      title={t("nav.leave.title")}
    >
      <div className="flex flex-col gap-2">
        <a
          href={landingHomeUrl(i18n.language)}
          target="_blank"
          rel="noopener"
          onClick={() => onOpenChange(false)}
          className={OPTION}
        >
          <span className={cn(ICON, "bg-primary/10 text-primary")}>
            <Globe className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{withBrand(t("nav.leave.site"))}</span>
            <span className="text-xs text-muted-foreground">{t("nav.leave.siteHint")}</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </a>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void logout().finally(() => setSigningOut(false));
          }}
          className={OPTION}
        >
          <span className={cn(ICON, "bg-destructive/10 text-destructive")}>
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{t("nav.leave.logout")}</span>
            <span className="text-xs text-muted-foreground">{t("nav.leave.logoutHint")}</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}
