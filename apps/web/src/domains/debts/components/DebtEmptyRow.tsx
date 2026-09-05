import { HandCoins } from "lucide-react";

/** The message that occupies the table/list body while it has no rows. No
 * border of its own — the surrounding Card/bordered container is already the
 * frame, same convention `PlanEmptyRow`/`TransactionTable`'s `EmptyRow` use. */
export function DebtEmptyRow({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <HandCoins className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
