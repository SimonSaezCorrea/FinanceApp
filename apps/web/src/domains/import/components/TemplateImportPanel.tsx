import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { imports } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { Segmented } from "../../../shared/ui/segmented";
import { useTemplateImport } from "../hooks/useTemplateImport";
import type { TemplateRefs } from "../lib/buildTemplate";
import { readTemplate, TemplateReadError, type TemplateReadFailure } from "../lib/readTemplate";
import { resolveTemplate, type LocalIssue } from "../lib/resolveTemplate";
import { columnKey, sheetNameKey } from "../lib/templateSpec";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refs: TemplateRefs;
}

/** A problem to show, whichever side found it. */
interface ShownIssue {
  sheet: imports.TemplateSheetKey;
  row: number;
  message: string;
}

/**
 * Uploads a filled Cuadra template (specs/027). The file is read and resolved in
 * the browser; the API then validates it for real (`preview`, which writes
 * nothing) and shows what it would do — counts per sheet, the effect on each
 * account under a chosen balance mode — or every problem, on its sheet and row.
 * Importing is all-or-nothing and retry-safe.
 */
export function TemplateImportPanel({ open, onOpenChange, refs }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { preview, commit } = useTemplateImport();
  const idempotencyKey = useIdempotencyKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const labelers = useMemo(() => [i18n.getFixedT("es"), i18n.getFixedT("en")], [i18n]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [failure, setFailure] = useState<TemplateReadFailure | "tooMany" | null>(null);
  const [request, setRequest] = useState<imports.TemplateImportRequest | null>(null);
  const [localIssues, setLocalIssues] = useState<LocalIssue[]>([]);
  const [modes, setModes] = useState<Record<string, imports.BalanceMode>>({});
  const [commitIssue, setCommitIssue] = useState<ShownIssue | null>(null);

  const accountName = (id: string) => refs.accounts.find((a) => a.id === id)?.name ?? id;
  const sheetName = (sheet: string) => t(sheetNameKey(sheet));

  function reset() {
    setFileName(null);
    setFailure(null);
    setRequest(null);
    setLocalIssues([]);
    setModes({});
    setCommitIssue(null);
    preview.reset();
    idempotencyKey.reset();
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function withModes(
    body: imports.TemplateImportRequest,
    next: Record<string, imports.BalanceMode>,
  ): imports.TemplateImportRequest {
    return {
      ...body,
      balanceModes: Object.entries(next).map(([accountId, mode]) => ({ accountId, mode })),
    };
  }

  async function loadFile(file: File) {
    reset();
    setReading(true);
    try {
      const read = await readTemplate(file, labelers);
      const resolved = resolveTemplate(read, refs, labelers);
      setFileName(file.name);
      const total = imports.TEMPLATE_SHEET_KEYS.reduce((n, k) => n + resolved.request[k].length, 0);
      if (total > imports.TEMPLATE_IMPORT_MAX_ROWS) {
        setFailure("tooMany");
        return;
      }
      setRequest(resolved.request);
      setLocalIssues(resolved.issues);
      // Only a file with nothing wrong locally goes to the server: its problems
      // would only repeat the ones already listed.
      if (resolved.issues.length === 0) preview.mutate(resolved.request);
    } catch (error) {
      setFailure(error instanceof TemplateReadError ? error.reason : "unreadable");
    } finally {
      setReading(false);
    }
  }

  function changeMode(accountId: string, mode: imports.BalanceMode) {
    if (!request) return;
    const next = { ...modes, [accountId]: mode };
    setModes(next);
    idempotencyKey.reset();
    preview.mutate(withModes(request, next));
  }

  function submit() {
    if (!request) return;
    setCommitIssue(null);
    commit.mutate(
      { body: withModes(request, modes), idempotencyKey: idempotencyKey.current() },
      {
        onSuccess: () => {
          toast.success(t("import.template.success"));
          close(false);
        },
        onError: (error: unknown) => {
          if (!(error instanceof ApiRequestError)) {
            toast.error(t("errors.INTERNAL_ERROR"));
            return;
          }
          const message = t(`errors.${error.code}`);
          const match = /^(\w+)\.(\d+)$/.exec(error.field ?? "");
          if (match && imports.TEMPLATE_SHEET_KEYS.includes(match[1] as never)) {
            setCommitIssue({
              sheet: match[1] as imports.TemplateSheetKey,
              row: Number(match[2]),
              message,
            });
          } else {
            toast.error(message);
          }
        },
      },
    );
  }

  const result = preview.data;
  const issues: ShownIssue[] = [
    ...localIssues.map((i) => ({
      sheet: i.sheet,
      row: i.row,
      message: t(`import.template.issues.${i.code}`, {
        column: t(columnKey(i.sheet, i.column)),
        value: i.value ?? "",
      }),
    })),
    ...(result?.errors ?? []).map((e) => ({
      sheet: e.sheet,
      row: e.row,
      message: t(`errors.${e.code}`, { defaultValue: e.code }),
    })),
    ...(commitIssue ? [commitIssue] : []),
  ];
  const ready = !!request && localIssues.length === 0 && !!result?.valid && !commitIssue;
  const busy = preview.isPending || commit.isPending;
  const loaded = !!request || !!failure;

  const failureMessage =
    failure === "tooMany"
      ? t("import.template.tooMany", { max: imports.TEMPLATE_IMPORT_MAX_ROWS })
      : failure
        ? t(`import.template.${failure === "unreadable" ? "readError" : failure}`)
        : null;

  return (
    <ResponsiveSurface
      open={open}
      onOpenChange={close}
      className="max-w-3xl"
      eyebrow={t("import.template.eyebrow")}
      title={fileName ?? t("import.template.panelTitle")}
      description={fileName ? undefined : t("import.template.panelDescription")}
      footer={
        request ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={reset}>
              <Upload className="h-4 w-4" aria-hidden />
              {t("import.template.changeFile")}
            </Button>
            <Button variant="accent" disabled={!ready || busy} onClick={submit}>
              {commit.isPending ? t("import.template.submitting") : t("import.template.submit")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!loaded ? (
        <div className="mx-auto flex max-w-xl flex-col gap-3 py-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            disabled={reading}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:bg-muted/40",
              dragging && "border-primary bg-primary/5",
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-chip text-muted-foreground">
              <FileSpreadsheet className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-sm font-medium">
              {reading ? t("import.template.reading") : t("import.template.pickTitle")}
            </span>
            <span className="text-xs text-muted-foreground">{t("import.template.pickHint")}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label={t("import.template.pickTitle")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void loadFile(file);
            }}
          />
        </div>
      ) : failureMessage ? (
        <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-6">
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {failureMessage}
          </p>
          <Button variant="outline" size="sm" onClick={reset}>
            <Upload className="h-4 w-4" aria-hidden />
            {t("import.template.changeFile")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {issues.length > 0 ? (
            <section role="alert" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {t("import.template.issuesTitle", { count: issues.length })}
              </h3>
              <p className="text-xs text-muted-foreground">{t("import.template.issuesHint")}</p>
              <ul className="scrollbar-thin max-h-72 overflow-auto rounded-md border border-border bg-card text-sm">
                {issues.map((issue, i) => (
                  <li key={i} className="border-b border-border px-3 py-2 last:border-b-0">
                    {t("import.template.issueLine", {
                      sheet: sheetName(issue.sheet),
                      row: issue.row,
                      message: issue.message,
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.isPending && !result ? (
            <p className="text-sm text-muted-foreground">{t("import.template.validating")}</p>
          ) : null}

          {result && localIssues.length === 0 ? (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{t("import.template.summaryTitle")}</h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {imports.TEMPLATE_SHEET_KEYS.filter((k) => result.counts[k] > 0).map((k) => (
                    <li
                      key={k}
                      className="flex items-baseline justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">{sheetName(k)}</span>
                      <span className="font-medium tabular-nums">{result.counts[k]}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {result.accounts.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{t("import.template.accountsTitle")}</h3>
                    <p className="text-xs text-muted-foreground">{t("import.template.modeHint")}</p>
                  </div>
                  <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                    {result.accounts.map((a) => {
                      const money = (v: string) =>
                        formatMoney(v, { currency: a.currency, locale: i18n.language });
                      // A credit card account holds no cash: its figure is the credit used.
                      const credit =
                        refs.accounts.find((r) => r.id === a.accountId)?.type === "CREDIT_CARD";
                      return (
                        <li
                          key={a.accountId}
                          className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">
                              {accountName(a.accountId)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t("import.template.net")}:{" "}
                              <span className="tabular-nums">
                                {money(credit ? a.netCredit : a.netCash)}
                              </span>
                              {" · "}
                              {credit
                                ? t("import.template.creditUsedAfter")
                                : t("import.template.balanceAfter")}
                              :{" "}
                              <span className="tabular-nums">
                                {money(credit ? a.creditUsedAfter : a.balanceAfter)}
                              </span>
                            </span>
                          </div>
                          <Segmented
                            size="sm"
                            variant="neutral"
                            aria-label={accountName(a.accountId)}
                            value={a.mode}
                            onChange={(mode) => changeMode(a.accountId, mode)}
                            options={[
                              { value: "INCLUDED", label: t("import.template.modeIncluded") },
                              { value: "ADD", label: t("import.template.modeAdd") },
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {t("import.template.reimportWarning")}
              </p>
            </>
          ) : null}
        </div>
      )}
    </ResponsiveSurface>
  );
}
