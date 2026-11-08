import { ChevronRight, Download, FileSpreadsheet, type LucideIcon, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { withBrand } from "@finance/ui/src/shared/lib/brand";
import { Modal } from "@finance/ui/src/shared/ui/overlay";

export type AccountImportAction = "download" | "upload" | "statement";

const ACTIONS: { value: AccountImportAction; icon: LucideIcon }[] = [
  { value: "download", icon: Download },
  { value: "upload", icon: Upload },
  { value: "statement", icon: FileSpreadsheet },
];

/**
 * What tapping an account in Importar opens: the same three ways in as the mifik template above
 * the list, for that one account — download its template (empty, or with its own data), upload one,
 * or import the bank's own statement into it. Each choice opens its own panel.
 */
export function AccountImportPanel({
  account,
  open,
  onOpenChange,
  onPick,
}: Readonly<{
  account: accounts.BankAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (action: AccountImportAction) => void;
}>) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-md"
      title={account.name}
      description={t("import.accountPanel.description")}
    >
      <ul className="flex flex-col gap-2">
        {ACTIONS.map(({ value, icon: Icon }) => (
          <li key={value}>
            <button
              type="button"
              onClick={() => onPick(value)}
              className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {withBrand(t(`import.accountPanel.${value}.title`))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {withBrand(t(`import.accountPanel.${value}.hint`))}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
