import { CreditCard, type LucideIcon } from "lucide-react";

/** A card-style visual used for the live account/card preview. */
export function CardPreview({
  brand,
  title,
  subtitle,
  primary,
  footerLeft,
  footerRight,
  icon: Icon = CreditCard,
}: {
  brand?: string;
  title: string;
  subtitle?: string;
  primary?: string;
  footerLeft?: string;
  footerRight?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="relative aspect-[16/10] w-full max-w-sm overflow-hidden rounded-xl border border-primary/35 bg-[linear-gradient(150deg,hsl(var(--brand)),hsl(var(--brand-deep)))] p-5 text-credit-ink shadow-md">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium opacity-90">{brand ?? ""}</span>
        <Icon className="h-6 w-6 opacity-90" aria-hidden />
      </div>
      <div className="mt-4">
        <p className="text-lg font-semibold leading-tight">{title || "—"}</p>
        {subtitle ? <p className="text-sm opacity-80">{subtitle}</p> : null}
      </div>
      {primary ? <p className="mt-3 text-2xl font-semibold tabular-nums">{primary}</p> : null}
      <div className="absolute inset-x-5 bottom-4 flex items-end justify-between text-xs opacity-90">
        <span>{footerLeft ?? ""}</span>
        <span className="tabular-nums">{footerRight ?? ""}</span>
      </div>
    </div>
  );
}
