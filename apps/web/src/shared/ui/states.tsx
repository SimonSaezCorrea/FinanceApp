import { AlertTriangle, type LucideIcon, Inbox, Loader2 } from "lucide-react";

import { cn } from "../lib/cn";

function Shell({
  icon: Icon,
  title,
  message,
  spin,
  className,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  spin?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center",
        className,
      )}
    >
      <Icon className={cn("h-6 w-6 text-muted-foreground", spin && "animate-spin")} aria-hidden />
      <p className="font-medium">{title}</p>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return <Shell icon={Inbox} title={title} message={message} />;
}

export function LoadingState({ title }: { title: string }) {
  return <Shell icon={Loader2} title={title} spin />;
}

export function ErrorState({ title, message }: { title: string; message?: string }) {
  return (
    <div role="alert">
      <Shell icon={AlertTriangle} title={title} message={message} className="text-destructive" />
    </div>
  );
}
