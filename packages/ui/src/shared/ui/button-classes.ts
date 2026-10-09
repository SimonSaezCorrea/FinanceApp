import { cn } from "../lib/cn";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "destructive" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

const BASE = cn(
  // `whitespace-nowrap`: the sizes below are fixed heights, so a wrapping
  // label overflows its own box instead of growing it.
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
  // A press confirms itself: a quick scale on `:active`, eased out so it lands at once.
  "transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50",
);

/** The button look as a class string — what `Button` renders, and what an element that has to be
 * something else uses to read as one (a router `Link` for an action that navigates, like the
 * profile summary's "next step"). Its own module so `button.tsx` only exports components. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, variants[variant], sizes[size], className);
}
