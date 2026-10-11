import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { auth } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { useStepUp } from "../hooks/useStepUp";
import { useUserEmailMutations, useUserEmails } from "../hooks/useUserEmails";
import { ProfileListRowsSkeleton } from "./ProfileSectionSkeleton";

const STATUS_VARIANT = {
  PRIMARY: "success",
  PENDING: "warning",
  PAST: "neutral",
} as const;

/**
 * "Correos de la cuenta" (specs/032): the primary address, a change waiting for its link and the
 * ones used before. Any address but the primary can be removed; a pending one can be sent again.
 */
export function EmailHistorySection() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useUserEmails();
  const { remove, resend } = useUserEmailMutations();
  const [toRemove, setToRemove] = useState<auth.UserEmail | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { needsStepUp, stepUpPanel } = useStepUp(t("profile.emails.stepUp"));
  const items = data?.items ?? [];

  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  const errorText = (err: unknown) =>
    t(`errors.${err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR"}`);

  async function sendAgain() {
    setMessage(null);
    try {
      await resend.mutateAsync();
      setMessage({ tone: "ok", text: t("profile.emails.resent") });
    } catch (err) {
      setMessage({ tone: "error", text: errorText(err) });
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setMessage(null);
    const target = toRemove;
    setToRemove(null);
    await removeEmail(target);
  }

  async function removeEmail(target: auth.UserEmail) {
    try {
      await remove.mutateAsync(target.id);
    } catch (err) {
      if (needsStepUp(err, () => void removeEmail(target))) return;
      setMessage({ tone: "error", text: errorText(err) });
    }
  }

  return (
    <section
      aria-labelledby="profile-emails-title"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-emails-title" className="text-base font-semibold">
          {t("profile.emails.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("profile.emails.description")}</p>
      </div>

      {isLoading ? (
        <ProfileListRowsSkeleton label={t("profile.emails.loading")} rows={2} />
      ) : (
        <ul className="overflow-hidden rounded-xl border">
          {items.map((email, index) => (
            <li
              key={email.id}
              className={
                index < items.length - 1
                  ? "flex items-center gap-3 border-b px-3.5 py-2.5"
                  : "flex items-center gap-3 px-3.5 py-2.5"
              }
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{email.address}</span>
                <span className="text-xs text-muted-foreground">
                  {email.status === "PAST" && email.replacedAt
                    ? t("profile.emails.usedUntil", { date: date(email.replacedAt) })
                    : email.verifiedAt
                      ? t("profile.emails.confirmedOn", { date: date(email.verifiedAt) })
                      : t("profile.emails.unconfirmed")}
                </span>
              </div>
              <Badge variant={STATUS_VARIANT[email.status]}>
                {t(`profile.emails.status.${email.status}`)}
              </Badge>
              {email.status === "PENDING" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resend.isPending}
                  onClick={() => void sendAgain()}
                >
                  {t("profile.emails.resend")}
                </Button>
              ) : null}
              {email.status !== "PRIMARY" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("profile.emails.remove", { address: email.address })}
                  onClick={() => setToRemove(email)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {message.text}
        </p>
      ) : null}

      {stepUpPanel}
      <ConfirmModal
        open={toRemove !== null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        onConfirm={() => void confirmRemove()}
        title={t("profile.emails.removeTitle")}
        description={t("profile.emails.removeDescription", { address: toRemove?.address ?? "" })}
        confirmLabel={t("profile.emails.removeConfirm")}
      />
    </section>
  );
}
