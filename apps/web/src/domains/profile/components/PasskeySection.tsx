import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Info, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { serializeCreateResponse, toCreateOptions } from "../../../shared/lib/webauthn";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal, SidePanel } from "../../../shared/ui/overlay";
import { FormTextField } from "../../../shared/ui/form";
import { SectionLabel } from "../../../shared/ui/section-label";
import { usePasskeysQuery, useProfileMutations } from "../hooks/useProfile";

function lastUsedLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  lastUsedAt: string | null,
) {
  if (!lastUsedAt) return t("profile.security.passkey.neverUsed");
  return t("profile.security.passkey.lastUsed", {
    date: new Date(lastUsedAt).toLocaleDateString(),
  });
}

/** Management panel (specs/022, US1+US3): list registered passkeys, add a new one (WebAuthn
 * ceremony + naming it), remove individually. Opened from `SecuritySection`'s "Configurar". */
export function PasskeySection({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation();
  const { data: passkeys, isLoading } = usePasskeysQuery();
  const { startPasskeyRegistration, confirmPasskeyRegistration, removePasskey } =
    useProfileMutations();
  const [pendingResponse, setPendingResponse] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    try {
      const { options } = await startPasskeyRegistration.mutateAsync();
      const credential = await navigator.credentials.create(toCreateOptions(options));
      if (!credential) return; // user cancelled
      setPendingResponse(serializeCreateResponse(credential));
      setName("");
    } catch {
      // The browser itself throws when the user cancels/dismisses the device prompt.
      setError(t("profile.security.passkey.ceremonyFailed"));
    }
  }

  async function handleConfirmName() {
    setError(null);
    try {
      await confirmPasskeyRegistration.mutateAsync({ name, response: pendingResponse });
      setPendingResponse(null);
      setName("");
      toast.success(t("profile.security.passkey.added"));
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
    }
  }

  async function handleRemove(id: string) {
    await removePasskey.mutateAsync(id);
    setRemovingId(null);
  }

  function close(next: boolean) {
    if (!next) {
      setPendingResponse(null);
      setName("");
      setError(null);
    }
    onOpenChange(next);
  }

  const naming = pendingResponse !== null;
  const removing = passkeys?.find((p) => p.id === removingId) ?? null;

  return (
    <SidePanel
      open={open}
      onOpenChange={close}
      eyebrow={t("profile.security.title")}
      title={t("profile.security.passkey.label")}
      description={t("profile.security.passkey.hint")}
      footer={
        naming ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="accent"
              className="flex-1"
              disabled={name.trim().length === 0 || confirmPasskeyRegistration.isPending}
              onClick={() => void handleConfirmName()}
            >
              {t("profile.security.passkey.save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingResponse(null);
                setError(null);
              }}
            >
              {t("profile.security.passkey.cancel")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="accent"
            className="w-full gap-2"
            disabled={startPasskeyRegistration.isPending}
            onClick={() => void handleAdd()}
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            {t("profile.security.passkey.add")}
          </Button>
        )
      }
    >
      {naming ? (
        <div className="flex flex-col gap-7">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <div className="text-base font-semibold">
                {t("profile.security.passkey.confirmedTitle")}
              </div>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {t("profile.security.passkey.confirmedHint")}
              </p>
            </div>
          </div>
          <FormTextField
            id="passkey-name"
            label={t("profile.security.passkey.nameLabel")}
            value={name}
            onChange={setName}
            placeholder={t("profile.security.passkey.namePlaceholder")}
            showEditIcon
            error={error}
            className="!border-b"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div>
            <SectionLabel>
              {t("profile.security.passkey.yourKeys", { count: passkeys?.length ?? 0 })}
            </SectionLabel>
            <div className="mt-2.5 flex flex-col gap-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t("profile.security.passkey.loading")}
                </p>
              ) : passkeys && passkeys.length > 0 ? (
                passkeys.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                      <KeyRound className="h-[18px] w-[18px]" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("profile.security.passkey.created", {
                          date: new Date(p.createdAt).toLocaleDateString(),
                        })}
                        {" · "}
                        {lastUsedLabel(t, p.lastUsedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("profile.security.passkey.remove.button")}
                      onClick={() => setRemovingId(p.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("profile.security.passkey.empty")}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary p-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("profile.security.passkey.alwaysHavePassword")}
            </p>
          </div>
        </div>
      )}

      <ConfirmModal
        open={removingId !== null}
        onOpenChange={(next) => !next && setRemovingId(null)}
        onConfirm={() => void handleRemove(removingId!)}
        title={t("profile.security.passkey.remove.title")}
        description={t("profile.security.passkey.remove.description")}
        confirmLabel={t("profile.security.passkey.remove.confirm")}
        loading={removePasskey.isPending}
      >
        {removing ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <KeyRound className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{removing.name}</div>
              <div className="text-xs text-muted-foreground">
                {t("profile.security.passkey.created", {
                  date: new Date(removing.createdAt).toLocaleDateString(),
                })}
                {" · "}
                {lastUsedLabel(t, removing.lastUsedAt)}
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmModal>
    </SidePanel>
  );
}
