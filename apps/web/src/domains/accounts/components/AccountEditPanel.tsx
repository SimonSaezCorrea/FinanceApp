import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";

import { useCountries, useInstitutions } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { ActiveToggle } from "../../../shared/ui/active-toggle";
import { ConfirmModal, SidePanel } from "../../../shared/ui/overlay";
import { UnsavedIndicator } from "../../../shared/ui/unsaved-indicator";
import { accounts as accountsContract } from "@finance/contracts";

import { useAccountMutations, useAccounts } from "../hooks/useAccounts";
import { AccountForm } from "./AccountForm";

/** Ties the panel footer's submit button to the form it lives outside of. */
const FORM_ID = "account-edit-form";

/**
 * Editing an account, in the same right-side `SidePanel` the card screens use:
 * the account stays visible behind it as context, the long form scrolls in the
 * panel's own body and its actions stay pinned at the bottom.
 *
 * It is opened by a ROUTE (`/accounts/:id/edit`) rather than by local state, so
 * the edit form keeps its own URL — deep-linkable, and closing it is a real
 * navigation that browser Back honours. `onClose` is what performs it.
 *
 * Deactivate/delete are NOT repeated here: they already live in the account
 * header behind this panel. Only the danger-zone delete inside the form stays,
 * since the form section is where the user is looking for it.
 */
export function AccountEditPanel({
  account,
  open,
  onClose,
  onDeleted,
}: Readonly<{
  account: accounts.BankAccount;
  open: boolean;
  /** Leave the edit URL (back to the account). */
  onClose: () => void;
  onDeleted: () => void;
}>) {
  const { t } = useTranslation();
  // The account doesn't store a country — its institution has one. Resolving it
  // here means editing an Argentine account opens on Argentina's catalogue and
  // its CBU/alias fields, instead of silently offering Chilean banks.
  const { data: allInstitutions } = useInstitutions();
  const { data: countries } = useCountries();
  // Deleting the last cash account is refused by the API; the button says so by
  // not being there, instead of failing when pressed.
  const { data: allAccounts } = useAccounts();
  const deletable = accountsContract.isDeletableAccount(
    account.type,
    (allAccounts ?? []).filter((a) => a.type === "CASH").length,
  );
  const accountCountry =
    countries?.find(
      (c) => c.id === allInstitutions?.find((i) => i.id === account.institutionId)?.countryId,
    )?.alpha2 ?? "CL";
  const { update, remove } = useAccountMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Owned here because the switch lives in the panel header, outside the form's
  // DOM; the form mirrors it into the values it submits.
  const [status, setStatus] = useState<accounts.AccountStatus>(account.status);
  // Leaving on purpose (saved, or the discard already confirmed) must stand the
  // guard down. It's a ref, not state: the navigation runs in the same tick as
  // the decision, before a state update could re-render.
  const leavingRef = useRef(false);
  // In-app navigation (the sidebar, the breadcrumb, browser back) is intercepted
  // by the router; a reload/tab close can only be caught by the native prompt.
  const blocker = useBlocker(() => open && dirty && !leavingRef.current);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    globalThis.addEventListener("beforeunload", onBeforeUnload);
    return () => globalThis.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function leave() {
    leavingRef.current = true;
    onClose();
  }

  /** Dismissing the panel: confirm first when there's something to lose. */
  function requestClose() {
    if (dirty) setConfirmLeave(true);
    else leave();
  }

  const fail = (err: unknown) => {
    const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
    toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
  };

  return (
    <>
      <SidePanel
        open={open}
        onOpenChange={(next) => !next && requestClose()}
        eyebrow={t("accounts.edit.title")}
        title={account.name}
        description={`${t(`accounts.type.${account.type}`)} · ${account.currency}`}
        headerAside={
          // At the account's own level, where its state belongs: it's a property
          // of the record being edited, not one more field at the bottom of a
          // long form. Saved with everything else — this is still the form's
          // value, only its control moved.
          <div className="flex items-center gap-3">
            <UnsavedIndicator visible={dirty} />
            <ActiveToggle
              checked={status === "ACTIVE"}
              onCheckedChange={(checked) => setStatus(checked ? "ACTIVE" : "INACTIVE")}
              label={t("accounts.form.accountActive")}
              activeLabel={t("accounts.status.ACTIVE")}
              inactiveLabel={t("accounts.status.INACTIVE")}
            />
          </div>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={requestClose} disabled={update.isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={FORM_ID} variant="accent" disabled={update.isPending}>
              {t("common.saveChanges")}
            </Button>
          </div>
        }
      >
        <AccountForm
          formId={FORM_ID}
          // One form, one action bar: the panel footer owns the submit.
          hideFooter
          submitLabel={t("accounts.actions.save")}
          submitting={update.isPending}
          hasCreditCard={account.cards.some((c) => c.kind === "CREDIT")}
          onDirtyChange={setDirty}
          status={status}
          onStatusChange={setStatus}
          dangerZone={
            !deletable ? null : (
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => setConfirmDelete(true)}
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("accounts.edit.deleteAccount")}
              </Button>
            )
          }
          initial={{
            name: account.name,
            type: account.type,
            status: account.status,
            institutionId: account.institutionId ?? "",
            accountNumber: account.accountNumber ?? "",
            accountAlias: account.accountAlias ?? "",
            country: accountCountry,
            currency: account.currency,
            initialBalance: account.initialBalance,
            overdraftLimit: account.overdraftLimit,
            balanceCeiling: account.balanceCeiling ?? "",
            creditLimit: account.creditLimit,
            creditUsedInitial: account.creditUsed,
            billingCycleDay: account.billingCycleDay?.toString() ?? "",
            billingCycleType: account.billingCycleType,
            paymentDueDay: account.paymentDueDay?.toString() ?? "",
            minimumPaymentPercent: account.minimumPaymentPercent ?? "",
            paymentMethod: account.paymentMethod,
          }}
          onSubmit={(v) =>
            update.mutate(
              {
                id: account.id,
                body: {
                  name: v.name,
                  type: v.type,
                  status: v.status,
                  currency: v.currency,
                  institutionId: v.institutionId || undefined,
                  accountNumber: v.accountNumber || undefined,
                  accountAlias: v.accountAlias.trim() || null,
                  initialBalance: v.initialBalance || "0",
                  overdraftLimit: v.overdraftLimit || "0",
                  balanceCeiling: v.balanceCeiling.trim() || null,
                  creditLimit: v.creditLimit || "0",
                  creditUsedInitial: v.creditUsedInitial || "0",
                  billingCycleDay: v.billingCycleDay ? Number(v.billingCycleDay) : null,
                  billingCycleType: v.billingCycleType,
                  paymentDueDay: v.paymentDueDay ? Number(v.paymentDueDay) : null,
                  // Empty = this account has no minimum, which is a real value
                  // (not "unchanged"), so it's sent as an explicit null.
                  minimumPaymentPercent: v.minimumPaymentPercent.trim() || null,
                  paymentMethod: v.paymentMethod,
                },
              },
              {
                onSuccess: () => {
                  toast.success(t("accounts.updated"));
                  leave();
                },
                onError: fail,
              },
            )
          }
        />
      </SidePanel>

      <ConfirmModal
        open={confirmLeave || blocker.state === "blocked"}
        onOpenChange={(v) => {
          if (v) return;
          setConfirmLeave(false);
          // Dismissing a blocked navigation must release it, or every later
          // attempt to leave is silently swallowed.
          if (blocker.state === "blocked") blocker.reset();
        }}
        title={t("accounts.edit.leaveConfirm")}
        description={t("accounts.edit.leaveConfirmDescription")}
        confirmLabel={t("accounts.edit.leaveDiscard")}
        onConfirm={() => {
          setConfirmLeave(false);
          leavingRef.current = true;
          // A blocked navigation already has a destination — resume it instead of
          // pushing our own, or the user lands somewhere they didn't ask for.
          if (blocker.state === "blocked") blocker.proceed();
          else onClose();
        }}
      />

      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("accounts.deleteConfirm")}
        description={t("accounts.deleteConfirmDescription")}
        confirmLabel={t("accounts.actions.delete")}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(account.id, {
            onSuccess: () => {
              toast.success(t("accounts.deleted"));
              setConfirmDelete(false);
              // Deleting discards the edits by definition — don't ask again.
              leavingRef.current = true;
              onDeleted();
            },
            onError: fail,
          })
        }
      />
    </>
  );
}
