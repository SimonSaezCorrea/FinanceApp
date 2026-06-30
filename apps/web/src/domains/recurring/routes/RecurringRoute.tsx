import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { recurring } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { RecurringFormModal } from "../components/RecurringFormModal";
import { useRecurring, useRecurringMutations } from "../hooks/useRecurring";

function recurringDateClass(nextDueAt: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDueAt);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "font-medium text-destructive";
  if (days <= 7) return "text-destructive";
  return "";
}

export function RecurringRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useRecurring();
  const { remove } = useRecurringMutations();
  const [modal, setModal] = useState<{ open: boolean; initial?: recurring.RecurringExpense }>({
    open: false,
  });
  const list = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("recurring.title")}
        actions={
          <Button onClick={() => setModal({ open: true })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("recurring.new")}
          </Button>
        }
      />

      <RecurringFormModal
        key={modal.initial?.id ?? "new"}
        open={modal.open}
        initial={modal.initial}
        onOpenChange={(open) => setModal((m) => ({ ...m, open }))}
      />

      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("recurring.empty")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.label}</span>
                    <Badge variant="info">{t(`recurring.frequency.${r.frequency}`)}</Badge>
                    {!r.active ? <Badge variant="neutral">{t("recurring.inactive")}</Badge> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.category ?? t("transactions.uncategorized")} ·{" "}
                    <span className={recurringDateClass(r.nextDueAt)}>
                      {t("recurring.next", {
                        date: new Date(r.nextDueAt).toLocaleDateString(i18n.language),
                      })}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-sm font-medium">
                    {formatMoney(r.amount, { locale: i18n.language, currency: r.currency })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ open: true, initial: r })}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      remove.mutate(r.id, {
                        onSuccess: () => toast.success(t("recurring.deleted")),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
