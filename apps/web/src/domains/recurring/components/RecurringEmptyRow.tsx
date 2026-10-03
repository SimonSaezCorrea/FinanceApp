import { Repeat } from "lucide-react";

/** The message that occupies the list body while there are no series. No border
 * of its own — the surrounding card is already the frame, same convention as
 * `DebtEmptyRow`/`PlanEmptyRow`. */
export function RecurringEmptyRow({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Repeat className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
