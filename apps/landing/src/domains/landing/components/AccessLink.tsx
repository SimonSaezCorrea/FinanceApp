import type { ReactNode } from "react";

import {
  type ButtonSize,
  type ButtonVariant,
  buttonClasses,
} from "@finance/ui/src/shared/ui/button-classes";

export type AccessMode = "login" | "registro";

/**
 * A call to sign in or create an account, drawn as a button. It is a real link to the same page
 * with `?acceso=…`, which the page's access script turns into opening the panel (and loading it,
 * the first time) — so it works with the keyboard, opens in a new tab, and costs no JavaScript
 * until someone actually uses it.
 */
export function AccessLink({
  mode,
  variant = "primary",
  size = "md",
  className,
  children,
}: Readonly<{
  mode: AccessMode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <a
      href={`?acceso=${mode}`}
      data-access={mode}
      className={buttonClasses({ variant, size, className })}
    >
      {children}
    </a>
  );
}
