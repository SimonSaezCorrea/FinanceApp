import type { ButtonHTMLAttributes } from "react";

import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "accent";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * `type="button"` by default, NOT the HTML default of `"submit"`: every form in
 * this app labels its submit explicitly, and an implicit submit caused a real bug
 * — React 19 flushes a click's state update synchronously, so a button that turned
 * INTO the submit button during its own click (a "Editar" that became "Guardar"
 * when the surface swapped to edit mode, reusing the same DOM node) had the
 * browser run the default action against the freshly patched attributes and saved
 * immediately.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // `whitespace-nowrap`: the sizes below are fixed heights, so a wrapping
        // label overflows its own box instead of growing it.
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
