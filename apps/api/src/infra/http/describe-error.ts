/**
 * Turns an unexpected (5xx) error into ONE readable line for the server log.
 *
 * The contract response stays a bare `{ error: { code } }` — this is purely
 * operator-facing. The point is that a failure like Prisma's `P2022` says what
 * actually broke and what to do about it, instead of leaving a bare code in the
 * log (which is what happened before: the `Cqrs` interceptor printed
 * `failed in 12.3ms (P2022)` and nothing else in the process ever printed the
 * message, so the real cause — a column missing from the database — was
 * invisible without reproducing the query by hand).
 */
export function describeError(exception: unknown): string {
  const prisma = asPrismaError(exception);
  if (prisma) return describePrismaError(prisma);

  if (exception instanceof Error) {
    return bounded(`${exception.name}: ${firstLine(exception.message)}`);
  }
  return bounded(`Non-Error thrown: ${firstLine(String(exception))}`);
}

/** The longest description written to the log or sent to Sentry. */
const MAX_DESCRIPTION = 300;

/**
 * Only the first line, and a bounded one: what follows it is where a library puts the data it was
 * handed — Prisma's validation errors print the whole query with its arguments (a RUT, an email,
 * an amount), a driver error its `detail`. The log and Sentry are outside the database, so they
 * must never carry that (privacy policy §4).
 */
function bounded(text: string): string {
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION)}…` : text;
}

/** The request path without its query or hash, which can carry filters and ids. */
export function pathOnly(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

/**
 * What is reported to Sentry for an unexpected error: the same one-line description the log gets,
 * keeping the original stack frames (the only thing that locates it) but never the raw message.
 */
export function reportableError(exception: unknown): Error {
  const description = describeError(exception);
  const reported = new Error(description);
  reported.name = exception instanceof Error ? exception.name : "NonError";
  if (exception instanceof Error && exception.stack) {
    const frames = exception.stack.split("\n").filter((line) => line.trimStart().startsWith("at "));
    reported.stack = [`${reported.name}: ${description}`, ...frames].join("\n");
  }
  return reported;
}

/**
 * Whether the log line above is enough on its own. Known, self-explanatory
 * failures (schema drift, DB unreachable) don't need a stack — the frames are
 * all Prisma internals and drown the message. Anything we can't name keeps its
 * stack, which is the only thing that locates it.
 */
export function needsStack(exception: unknown): boolean {
  return asPrismaError(exception) === undefined;
}

type PrismaError = { code: string; message: string; meta?: Record<string, unknown> };

/**
 * Duck-typed rather than `instanceof PrismaClientKnownRequestError`: `infra/http`
 * must not import `@prisma/client` (only a table's own adapter may — see the
 * one-table-one-domain rule), and the shape is stable across Prisma versions.
 */
function asPrismaError(exception: unknown): PrismaError | undefined {
  if (!(exception instanceof Error)) return undefined;
  const candidate = exception as Error & { code?: unknown; meta?: unknown };
  if (typeof candidate.code !== "string" || !/^P\d{4}$/.test(candidate.code)) return undefined;
  return {
    code: candidate.code,
    message: candidate.message,
    meta:
      typeof candidate.meta === "object" && candidate.meta !== null
        ? (candidate.meta as Record<string, unknown>)
        : undefined,
  };
}

function describePrismaError({ code, message, meta }: PrismaError): string {
  const at = (key: string): string | undefined => {
    const value = meta?.[key];
    return typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : undefined;
  };

  switch (code) {
    case "P2021":
      return `${code}: table \`${at("table") ?? "?"}\` does not exist in the database. The schema and the database have drifted — run \`pnpm db:migrate\`.`;
    case "P2022":
      return `${code}: column \`${at("column") ?? "?"}\` does not exist in the database. The schema and the database have drifted — run \`pnpm db:migrate\`.`;
    case "P2002":
      return `${code}: unique constraint violated on \`${at("target") ?? "?"}\`. A domain error should have caught this first (e.g. EMAIL_TAKEN) — this reached the filter unhandled.`;
    case "P2003":
      return `${code}: foreign key constraint violated on \`${at("field_name") ?? "?"}\`. The referenced row does not exist (or was deleted concurrently).`;
    case "P2025":
      return `${code}: the record the operation expected does not exist${at("cause") ? ` (${at("cause")})` : ""}. Usually a missing existence check before an update/delete — it should be a 404, not a 500.`;
    case "P1001":
      return `${code}: cannot reach the database. Is Postgres up (\`docker compose up -d\`) and DATABASE_URL correct?`;
    case "P1017":
      return `${code}: the database closed the connection. Restart the API; if it repeats, check the Postgres logs for a crash or an idle timeout.`;
    default:
      return `${code}: ${firstLine(message)}`;
  }
}

/**
 * Prisma formats its messages as a multi-line ASCII block (query, caret, hint).
 * The first non-empty line carries the meaning; the rest is the noise this
 * whole helper exists to keep out of the log.
 */
function firstLine(message: string): string {
  const line = message
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line ?? message;
}
