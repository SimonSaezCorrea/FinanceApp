import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { auth } from "@finance/contracts";
import { failureCode } from "@finance/client";
import { Laptop, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { Badge } from "../../../shared/ui/badge";
import { formatDateTime, isPhone } from "../lib/deviceDisplay";
import { useProfileMutations, useTrustedDevicesQuery } from "../hooks/useProfile";
import { ProfileListRowsSkeleton } from "./ProfileSectionSkeleton";

/**
 * Browsers that skip the second factor (specs/040 US2). Only shown while MFA is on. "Quitar"
 * forgets one: its next sign-in asks for the code again. Forgetting never needs a step-up — it
 * only takes access away.
 */
export function TrustedDevicesList() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useTrustedDevicesQuery();
  const { removeTrustedDevice } = useProfileMutations();
  const [removing, setRemoving] = useState<auth.TrustedDevice | null>(null);
  const devices = isError ? [] : (data?.items ?? []);

  async function confirmRemove() {
    if (!removing) return;
    try {
      await removeTrustedDevice.mutateAsync(removing.id);
      toast.success(t("profile.security.mfa.devices.removed"));
      setRemoving(null);
    } catch (err) {
      const code = failureCode(err);
      toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
    }
  }

  return (
    <div
      id="trusted-devices"
      tabIndex={-1}
      className="scroll-mt-24 rounded-2xl border bg-card p-5 focus:outline-none"
    >
      <h2 className="text-sm font-semibold">{t("profile.security.mfa.devices.title")}</h2>
      <p className="mb-2 text-xs text-muted-foreground">{t("profile.security.mfa.devices.hint")}</p>
      <div className="overflow-hidden rounded-lg border">
        {isLoading ? (
          <ProfileListRowsSkeleton label={t("profile.security.mfa.devices.loading")} />
        ) : devices.length === 0 ? (
          <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
            {t("profile.security.mfa.devices.empty")}
          </p>
        ) : (
          devices.map((d, i) => (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5",
                i < devices.length - 1 && "border-b",
              )}
            >
              {isPhone(d.deviceLabel) ? (
                <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-medium">
                  {d.deviceLabel || t("profile.security.sessions.unknownDevice")}
                  {d.isCurrent ? (
                    <Badge variant="success">{t("profile.security.mfa.devices.current")}</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground sm:text-[11px]">
                  {[
                    t("profile.security.mfa.devices.rememberedOn", {
                      date: formatDateTime(d.createdAt, i18n.language),
                    }),
                    d.lastUsedAt
                      ? t("profile.security.mfa.devices.lastUsed", {
                          date: formatDateTime(d.lastUsedAt, i18n.language),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-destructive disabled:opacity-60 sm:text-[11px]"
                disabled={removeTrustedDevice.isPending}
                onClick={() => setRemoving(d)}
              >
                {t("profile.security.mfa.devices.remove")}
              </button>
            </div>
          ))
        )}
      </div>
      <ConfirmModal
        open={removing !== null}
        onOpenChange={(next) => !next && setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={t("profile.security.mfa.devices.removeTitle")}
        description={t("profile.security.mfa.devices.removeBody", {
          device: removing?.deviceLabel || t("profile.security.sessions.unknownDevice"),
        })}
        confirmLabel={t("profile.security.mfa.devices.remove")}
        loading={removeTrustedDevice.isPending}
      />
    </div>
  );
}
