import { FileText, Loader2, Paperclip, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { transactions as contract } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { useAttachments } from "../hooks/useAttachments";

interface PendingFile {
  /** Local id — the server assigns the real one only once it lands. */
  key: string;
  file: File;
  status: "waiting" | "uploading" | "failed";
  error?: string;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Local pre-check, so an oversized or unsupported file never leaves the browser. */
function localReject(file: File): string | null {
  if (!contract.isAllowedAttachmentType(file.type)) return "ATTACHMENT_TYPE_NOT_ALLOWED";
  if (file.size > contract.ATTACHMENT_MAX_BYTES) return "ATTACHMENT_TOO_LARGE";
  return null;
}

/**
 * Uploading is switched OFF until an object-storage bucket is actually
 * provisioned: with no `S3_*` configured the API answers `503
 * ATTACHMENTS_UNAVAILABLE`, so offering the picker would only produce an error
 * the user can do nothing about. The button stays visible but disabled and reads
 * "Próximamente". Flip this to `true` once the bucket exists — nothing else
 * changes (see `docs/PENDING.md`).
 */
export const ATTACHMENT_UPLOAD_ENABLED = false;

interface Props {
  /** Absent while creating: the files are held until the movement has an id. */
  transactionId?: string;
  /** Read-only rendering (the detail panel) hides the picker. */
  readOnly?: boolean;
  /** Fired when every deferred file has landed (or there were none). */
  onPendingSettled?: (allSucceeded: boolean) => void;
  onPendingCountChange?: (count: number) => void;
  /** Overrides the flag above — used by the tests that exercise the flow. */
  uploadEnabled?: boolean;
}

/**
 * Receipts of a movement. While the movement doesn't exist yet the chosen files
 * are kept in memory and uploaded as soon as it does (FR-021a); one that fails
 * stays listed with a Retry button rather than being silently dropped (FR-021b).
 */
export function AttachmentsSection({
  transactionId,
  readOnly = false,
  onPendingSettled,
  onPendingCountChange,
  uploadEnabled = ATTACHMENT_UPLOAD_ENABLED,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const { list, upload, remove, open } = useAttachments(transactionId);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onPendingCountChange?.(pending.length);
  }, [pending.length, onPendingCountChange]);

  /** The id isn't passed in: `useAttachments` already closes over it. */
  async function send(entry: PendingFile) {
    setPending((p) => p.map((x) => (x.key === entry.key ? { ...x, status: "uploading" } : x)));
    try {
      await upload.mutateAsync(entry.file);
      setPending((p) => p.filter((x) => x.key !== entry.key));
      return true;
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setPending((p) =>
        p.map((x) => (x.key === entry.key ? { ...x, status: "failed", error: code } : x)),
      );
      return false;
    }
  }

  // The movement just got an id: flush whatever was chosen while it had none.
  useEffect(() => {
    if (!transactionId) return;
    const waiting = pending.filter((p) => p.status === "waiting");
    if (waiting.length === 0) return;
    let cancelled = false;
    void (async () => {
      let ok = true;
      for (const entry of waiting) {
        const sent = await send(entry);
        ok = ok && sent;
        if (cancelled) return;
      }
      onPendingSettled?.(ok);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the id appears
  }, [transactionId]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const accepted: PendingFile[] = [];
    for (const file of Array.from(files)) {
      const reason = localReject(file);
      if (reason) {
        setError(reason);
        continue;
      }
      accepted.push({
        key: `${file.name}-${file.size}-${accepted.length}`,
        file,
        status: "waiting",
      });
    }
    if (accepted.length === 0) return;
    setError(null);
    setPending((p) => [...p, ...accepted]);
    // With an id already, upload right away; otherwise wait for one.
    if (transactionId) void Promise.all(accepted.map((entry) => send(entry)));
  }

  const items = list.data ?? [];

  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" aria-hidden />
          {t("transactions.attachments.title")}
        </span>
        {readOnly ? null : (
          <>
            {uploadEnabled ? (
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={contract.ATTACHMENT_CONTENT_TYPES.join(",")}
                multiple
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
                aria-label={t("transactions.attachments.browse")}
              />
            ) : null}
            {/* Natively disabled, not just styled: no handler fires at all, and
                the title says why. */}
            <Button
              variant="outline"
              size="sm"
              disabled={!uploadEnabled}
              title={uploadEnabled ? undefined : t("transactions.attachments.comingSoonReason")}
              onClick={() => inputRef.current?.click()}
            >
              {uploadEnabled
                ? t("transactions.attachments.browse")
                : t("transactions.attachments.comingSoon")}
            </Button>
          </>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {uploadEnabled
          ? t("transactions.attachments.hint")
          : t("transactions.attachments.comingSoonReason")}
      </p>

      {items.length === 0 && pending.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {transactionId
            ? t("transactions.attachments.empty")
            : t("transactions.attachments.saveFirst")}
        </p>
      ) : null}

      <ul className="mt-2 flex flex-col gap-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{a.fileName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatSize(a.sizeBytes)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void open(a.id)
                    .then((url) => window.open(url, "_blank", "noopener"))
                    .catch((err: unknown) =>
                      setError(err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR"),
                    );
                }}
              >
                {t("transactions.attachments.open")}
              </Button>
              {readOnly ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("transactions.attachments.delete")}
                  onClick={() => remove.mutate(a.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </Button>
              )}
            </span>
          </li>
        ))}

        {pending.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {p.status === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate">{p.file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {p.status === "uploading"
                  ? t("transactions.attachments.uploading")
                  : p.status === "failed"
                    ? t("transactions.attachments.failed")
                    : formatSize(p.file.size)}
              </span>
            </span>
            {p.status === "failed" && transactionId ? (
              <Button variant="ghost" size="sm" onClick={() => void send(p)}>
                <RotateCw className="h-4 w-4" aria-hidden />
                {t("transactions.attachments.retry")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-2 text-xs text-destructive">
          {t(`errors.${error}`, { defaultValue: t("errors.INTERNAL_ERROR") })}
        </p>
      ) : null}
    </section>
  );
}
