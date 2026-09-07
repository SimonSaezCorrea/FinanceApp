import {
  Backpack,
  Car,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  type LucideIcon,
  Plane,
  Shield,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import type { savings } from "@finance/contracts";

/** Fixed icon set the README's examples draw from, extended so more than 5
 * goals still each get a distinct one before it has to repeat. Always
 * automatic — only the color is ever user-chosen. */
const ICONS: LucideIcon[] = [
  Home,
  Shield,
  Plane,
  Laptop,
  GraduationCap,
  Car,
  Gift,
  Heart,
  Backpack,
  ShoppingBag,
  Sparkles,
];

/** The full `SavingsGoalColor` palette, in the fixed order the picker shows
 * them and the automatic hash rotates through — same design tokens the rest
 * of the app already themes with, never a one-off hex. */
export const GOAL_COLOR_TOKENS: savings.SavingsGoalColor[] = [
  "brand",
  "success",
  "accent",
  "warning",
  "destructive",
  "primary",
  "info",
  "muted-foreground",
];

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export interface GoalVisual {
  icon: LucideIcon;
  /** CSS `hsl(var(--x))` string, ready to use as a `color`/`backgroundColor`. */
  color: string;
  colorToken: savings.SavingsGoalColor;
}

/** `hsl(var(--x))` for a given palette token — shared by the picker's own
 * swatches and by `goalVisual` itself, so they can never draw from different
 * token names. */
export function colorForToken(token: savings.SavingsGoalColor): string {
  return `hsl(var(--${token}))`;
}

/**
 * Icon is always automatic (a stable hash of the goal id); color is the
 * goal's own `color` when the user picked one, otherwise the same
 * deterministic hash decides it — so a goal that has never been touched
 * paints exactly as it always did before this was choosable.
 */
export function goalVisual(goalId: string, color: savings.SavingsGoalColor | null): GoalVisual {
  const hash = hashId(goalId);
  const icon = ICONS[hash % ICONS.length]!;
  const colorToken =
    color ?? GOAL_COLOR_TOKENS[Math.floor(hash / ICONS.length) % GOAL_COLOR_TOKENS.length]!;
  return { icon, color: colorForToken(colorToken), colorToken };
}
