import {
  AlertTriangle,
  FileQuestion,
  Inbox,
  Loader2,
  type LucideIcon,
  LogIn,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ApiRequestError } from "../lib/apiClient";
import { cn } from "../lib/cn";
import { Button } from "./button";

/** Muted (empty/informational) vs. destructive (something is actually wrong) —
 * the only two tones a shell's icon chip needs; everything else is identical. */
type Tone = "muted" | "destructive";

const toneChip: Record<Tone, string> = {
  muted: "bg-chip text-muted-foreground",
  destructive: "bg-destructive/15 text-destructive",
};

const toneGlow: Record<Tone, string> = {
  muted: "bg-muted-foreground/15",
  destructive: "bg-destructive/25",
};

function Shell({
  icon: Icon,
  title,
  message,
  spin,
  tone = "muted",
  /** "dashed" (loading) · "card" (a real surface with a soft glow behind the
   * icon — a blocking error, worth a viewer's attention) · "plain" (no box at
   * all, bare icon — "nothing here yet", the same weight as a table's own
   * empty row, e.g. `TransactionTable`'s `EmptyRow`, so the two read as ONE
   * pattern instead of two different ones). */
  variant = "dashed",
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  spin?: boolean;
  tone?: Tone;
  variant?: "dashed" | "card" | "plain";
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        variant === "card" &&
          "mx-auto w-full max-w-[640px] rounded-xl border border-border bg-card px-8 py-14 shadow-sm",
        variant === "dashed" && "rounded-lg border border-dashed border-border py-12",
        variant === "plain" && "gap-2",
        className,
      )}
    >
      {variant === "card" ? (
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className={cn("absolute inset-0 rounded-full blur-xl", toneGlow[tone])} />
          <div
            className={cn("relative flex h-11 w-11 items-center justify-center rounded-full", toneChip[tone])}
          >
            <Icon className={cn("h-5 w-5", spin && "animate-spin")} aria-hidden />
          </div>
        </div>
      ) : variant === "plain" ? (
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      ) : (
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", toneChip[tone])}>
          <Icon className={cn("h-5 w-5", spin && "animate-spin")} aria-hidden />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {message ? <p className="max-w-sm text-sm text-muted-foreground">{message}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function LoadingState({ title }: { title: string }) {
  return <Shell icon={Loader2} title={title} spin />;
}

/**
 * What a failed view is actually showing — not just "an error happened".
 * `connection` = the request never reached the server (offline, DNS, CORS…);
 * `server` = it reached the server and the server said no, shown in ITS OWN
 * words via `error.code` → `errors.<CODE>` (the same map every mutation's
 * toast already uses — this is the "mensaje en lenguaje humano" case);
 * `notFound` / `unauthorized` are their own kinds because retrying rarely
 * helps — they get an escape hatch instead (see `KIND_ESCAPE`); `empty`
 * isn't an error at all (the request succeeded, there's just nothing to
 * show) but shares the same shell so a view only needs ONE component for
 * "couldn't show you anything".
 */
export type ErrorKind = "connection" | "server" | "notFound" | "unauthorized" | "empty";

/** A request that never reached the server (the only case left once it isn't
 * an `ApiRequestError`) is the one situation this app can't put a code to. */
function detectKind(error: unknown): Exclude<ErrorKind, "empty"> {
  if (error instanceof ApiRequestError) {
    if (error.status === 404) return "notFound";
    if (error.status === 401 || error.status === 403) return "unauthorized";
    return "server";
  }
  return "connection";
}

const KIND_ICON: Record<ErrorKind, LucideIcon> = {
  connection: WifiOff,
  server: AlertTriangle,
  notFound: FileQuestion,
  unauthorized: LogIn,
  empty: Inbox,
};

const KIND_TONE: Record<ErrorKind, Tone> = {
  connection: "destructive",
  server: "destructive",
  notFound: "muted",
  unauthorized: "destructive",
  empty: "muted",
};

/** Where each dead-end kind's escape hatch goes — retrying a 404 or an
 * expired session rarely helps, so these get somewhere to go instead. */
const KIND_ESCAPE: Partial<Record<ErrorKind, { labelKey: string; to: string }>> = {
  notFound: { labelKey: "states.error.notFound.action", to: "/" },
  unauthorized: { labelKey: "states.error.unauthorized.action", to: "/login" },
};

export function ErrorState({
  kind,
  error,
  title,
  message,
  retryLabel,
  onRetry,
  inline,
}: {
  /** Explicit kind. Omit it and pass `error` instead to let the view show
   * what ACTUALLY went wrong (offline vs. not found vs. the server's own
   * message) rather than one generic sentence regardless of cause. With
   * neither, it's a plain "server" error (today's old default). */
  kind?: ErrorKind;
  /** The query/mutation's own thrown error. */
  error?: unknown;
  /** Overrides the kind's default copy — for a caller that has something
   * more specific to say than the kind's own default. */
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** No card, no border, no vertical centering — for embedding inside chrome
   * that's already the frame (a table's header row stays static regardless
   * of what's in its body, so the failure belongs INSIDE the body, the same
   * place `EmptyState` already renders its own message, not swapped in over
   * the whole section). Same idea as `kind="empty"`'s own look, just for a
   * real error. */
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const resolvedKind = kind ?? (error !== undefined ? detectKind(error) : "server");
  const code = error instanceof ApiRequestError ? error.code : null;
  const resolvedTitle =
    title ??
    (resolvedKind === "server" && code
      ? t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") })
      : t(`states.error.${resolvedKind}.title`));
  const resolvedMessage = message ?? t(`states.error.${resolvedKind}.message`, { defaultValue: "" });
  const escape = KIND_ESCAPE[resolvedKind];

  if (resolvedKind === "empty") {
    return (
      <div className="flex min-h-[240px] items-center justify-center py-10">
        <Shell
          icon={KIND_ICON.empty}
          title={resolvedTitle}
          message={resolvedMessage || undefined}
          tone="muted"
          variant="plain"
        />
      </div>
    );
  }

  const actions =
    onRetry || escape ? (
      <div className="mt-2 flex items-center gap-2">
        {onRetry ? (
          <Button variant="accent" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {retryLabel ?? t("common.retry")}
          </Button>
        ) : null}
        {escape ? (
          // A plain anchor, not `useNavigate`: this is a shared primitive
          // rendered in plenty of places with no <Router> around it (unit
          // tests included) — a dead-end kind is rare enough that a full
          // navigation here is the right tradeoff over requiring one.
          <a
            href={escape.to}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t(escape.labelKey)}
          </a>
        ) : null}
      </div>
    ) : undefined;

  if (inline) {
    return (
      <div role="alert" className="flex min-h-[240px] items-center justify-center py-10">
        <Shell
          icon={KIND_ICON[resolvedKind]}
          title={resolvedTitle}
          message={resolvedMessage || undefined}
          tone={KIND_TONE[resolvedKind]}
          variant="plain"
          actions={actions}
        />
      </div>
    );
  }

  return (
    <div role="alert" className="flex min-h-[420px] items-center justify-center">
      <Shell
        icon={KIND_ICON[resolvedKind]}
        title={resolvedTitle}
        message={resolvedMessage || undefined}
        tone={KIND_TONE[resolvedKind]}
        variant="card"
        actions={actions}
      />
    </div>
  );
}

/** Not an error — the request succeeded and there's genuinely nothing to
 * show. Kept as its own name (many call sites already read that way) but
 * built on the same shell as `ErrorState` (`kind="empty"`) instead of a
 * second, diverging implementation. */
export function EmptyState({ title, message }: { title: string; message?: string }) {
  return <ErrorState kind="empty" title={title} message={message} />;
}
