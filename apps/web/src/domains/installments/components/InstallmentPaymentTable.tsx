import { Fragment, useMemo, useState } from "react";
import { ChevronRight, CircleCheck, Monitor, Package, Pencil, Smartphone, Trash2, Tv, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { EmptyState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";

export interface FlatPayment {
  paymentId: string;
  planId: string;
  planTitle: string;
  planInstallmentCount: number;
  planTotalPrincipal: string;
  planPaidCount: number;
  planNextDueDate: string | null;
  currency: string;
  sequence: number;
  dueDate: string;
  amount: string;
  paidAt: string | null;
  isNextForPlan: boolean;
}

interface InstallmentPaymentTableProps {
  payments: FlatPayment[];
  onEditPlan: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  onPayPayment: (planId: string, sequence: number) => void;
  onUnpayPayment: (planId: string, sequence: number) => void;
}

type DisplayStatus = "upcoming" | "last" | "pending" | "paid";

const statusVariant: Record<DisplayStatus, "accent" | "info" | "neutral" | "success"> = {
  upcoming: "accent",
  last: "info",
  pending: "neutral",
  paid: "success",
};

function getStatus(p: FlatPayment): DisplayStatus {
  if (p.paidAt !== null) return "paid";
  if (!p.isNextForPlan) return "pending";
  return p.sequence === p.planInstallmentCount ? "last" : "upcoming";
}

function productIcon(title: string): LucideIcon {
  const lower = title.toLowerCase();
  if (/notebook|laptop|computador|macbook|pc/.test(lower)) return Monitor;
  if (/iphone|samsung|celular|móvil|movil|phone|pixel/.test(lower)) return Smartphone;
  if (/tv|televisor|tele/.test(lower)) return Tv;
  return Package;
}

function fmtDate(iso: string, locale: string, short = false): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    ...(short ? {} : { year: "numeric" }),
  });
}

type Proximity = "overdue" | "soon" | "fine";

function proximity(iso: string): Proximity {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "fine";
}

function paymentDateClass(dueDate: string, paidAt: string | null): string {
  if (paidAt !== null) return "text-muted-foreground";
  const p = proximity(dueDate);
  if (p === "overdue") return "font-medium text-destructive";
  if (p === "soon") return "font-medium text-destructive";
  return "text-success";
}

type BadgeVariant = "success" | "danger";

function planBadgeVariant(nextDueDate: string): BadgeVariant {
  const p = proximity(nextDueDate);
  if (p === "overdue" || p === "soon") return "danger";
  return "success";
}

interface PlanGroup {
  planId: string;
  planTitle: string;
  planInstallmentCount: number;
  planTotalPrincipal: string;
  planPaidCount: number;
  planNextDueDate: string | null;
  currency: string;
  monthlyAmount: string;
  payments: FlatPayment[];
}

export function InstallmentPaymentTable({
  payments,
  onEditPlan,
  onDeletePlan,
  onPayPayment,
  onUnpayPayment,
}: InstallmentPaymentTableProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const groups = useMemo<PlanGroup[]>(() => {
    const map = new Map<string, { first: FlatPayment; all: FlatPayment[] }>();
    for (const p of payments) {
      const existing = map.get(p.planId);
      if (existing) {
        existing.all.push(p);
      } else {
        map.set(p.planId, { first: p, all: [p] });
      }
    }
    return Array.from(map.values()).map(({ first, all }) => ({
      planId: first.planId,
      payments: [...all].sort((a, b) => a.sequence - b.sequence),
      planTitle: first.planTitle,
      planInstallmentCount: first.planInstallmentCount,
      planTotalPrincipal: first.planTotalPrincipal,
      planPaidCount: first.planPaidCount,
      planNextDueDate: first.planNextDueDate,
      currency: first.currency,
      monthlyAmount: first.amount,
    }));
  }, [payments]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(planId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  if (groups.length === 0) return <EmptyState title={t("installments.empty")} />;

  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-8" />
          <TH className="w-8" />
          <TH>{t("installments.table.product")}</TH>
          <TH>{t("installments.table.progress")}</TH>
          <TH>{t("installments.table.status")}</TH>
          <TH numeric>{t("installments.table.amount")}</TH>
          <TH className="w-24" />
        </TR>
      </THead>
      <tbody>
        {groups.map((group) => {
          const isExpanded = expanded.has(group.planId);
          const Icon = productIcon(group.planTitle);
          const progressPct = Math.min(
            100,
            (group.planPaidCount / group.planInstallmentCount) * 100,
          );
          const allPaid = group.planPaidCount === group.planInstallmentCount;

          return (
            <Fragment key={group.planId}>
              {/* Plan header row — click to expand/collapse */}
              <TR
                onClick={() => toggle(group.planId)}
                className="cursor-pointer bg-muted/20 hover:bg-muted/40"
              >
                <TD className="py-2.5">
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-150",
                      isExpanded && "rotate-90",
                    )}
                    aria-hidden
                  />
                </TD>
                <TD className="py-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </TD>
                <TD className="py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{group.planTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.planInstallmentCount}{" "}
                      {t("installments.planCard.installments")} ·{" "}
                      {formatMoney(group.monthlyAmount, { locale, currency: group.currency })}
                      {t("installments.planCard.perMonth")}
                    </span>
                  </div>
                </TD>
                <TD className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {group.planPaidCount}/{group.planInstallmentCount}
                    </span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </TD>
                <TD className="py-2.5">
                  {allPaid && <Badge variant="success">{t("installments.status.paid")}</Badge>}
                  {!allPaid && group.planNextDueDate && (
                    <Badge variant={planBadgeVariant(group.planNextDueDate)}>
                      {t("installments.planCard.nextDue", {
                        date: fmtDate(group.planNextDueDate, locale, true),
                      })}
                    </Badge>
                  )}
                </TD>
                <TD numeric className="py-2.5 font-semibold tabular-nums">
                  {formatMoney(group.planTotalPrincipal, { locale, currency: group.currency })}
                </TD>
                <TD className="py-2.5">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEditPlan(group.planId); }}
                      aria-label={t("common.edit")}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeletePlan(group.planId); }}
                      aria-label={t("common.delete")}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TD>
              </TR>

              {/* Individual payment sub-rows — shown when expanded */}
              {isExpanded &&
                group.payments.map((p) => {
                  const status = getStatus(p);
                  return (
                    <TR key={p.paymentId} className="bg-muted/5">
                      <TD className="py-2" />
                      <TD className="py-2" />
                      <TD className="py-2 pl-8 text-sm text-muted-foreground tabular-nums">
                        {t("installments.calendar.seqFmt", {
                          seq: p.sequence,
                          total: p.planInstallmentCount,
                        })}
                      </TD>
                      <TD className={cn("py-2 text-sm tabular-nums", paymentDateClass(p.dueDate, p.paidAt))}>
                        {fmtDate(p.dueDate, locale)}
                      </TD>
                      <TD className="py-2">
                        <Badge variant={statusVariant[status]}>
                          {t(`installments.status.${status}`)}
                        </Badge>
                      </TD>
                      <TD numeric className="py-2 text-sm text-muted-foreground tabular-nums">
                        {formatMoney(p.amount, { locale, currency: p.currency })}
                      </TD>
                      <TD className="py-2">
                        <div className="flex items-center justify-end">
                          {p.paidAt === null ? (
                            <button
                              type="button"
                              onClick={() => onPayPayment(p.planId, p.sequence)}
                              aria-label={t("installments.payment.pay")}
                              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-success/10 hover:text-success"
                            >
                              <CircleCheck className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onUnpayPayment(p.planId, p.sequence)}
                              aria-label={t("installments.payment.unpay")}
                              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}
