"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

const nav = [
  { href: "/dashboard", key: "dashboard" as const },
  { href: "/transactions", key: "transactions" as const },
  { href: "/installments", key: "installments" as const },
  { href: "/debts", key: "debts" as const },
  { href: "/savings", key: "savings" as const },
  { href: "/accounts", key: "accounts" as const },
  { href: "/investments", key: "investments" as const },
  { href: "/import", key: "import" as const },
];

export function SidebarNav({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
