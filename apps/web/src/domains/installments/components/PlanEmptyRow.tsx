import { Inbox } from "lucide-react";

/** The message that occupies the plan table/list body while it has no rows.
 * No border of its own — the surrounding Card and header row (or the list's
 * own bordered container) are already the frame, same convention
 * `TransactionTable`'s own `EmptyRow` uses. */
export function PlanEmptyRow({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
