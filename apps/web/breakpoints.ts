/**
 * What Tailwind's default breakpoints MEAN in this app, and the single place the
 * JS media queries read them from.
 *
 * The scale itself is Tailwind's untouched default — no custom screens. What this
 * file adds is the agreed reading of each step, so a layout decision picks a
 * breakpoint by intent instead of by measuring a screenshot:
 *
 * | class  | px   | stage                                             |
 * |--------|------|---------------------------------------------------|
 * | (none) | 0    | phone (the base styles are the mobile layout)      |
 * | `sm`   | 640  | end of phone / start of tablet                     |
 * | `md`   | 768  | tablet                                             |
 * | `lg`   | 1024 | tablet                                             |
 * | `xl`   | 1280 | widest tablet — last stop before desktop           |
 * | `2xl`  | 1536 | desktop (second columns, per-column scrolling)     |
 *
 * Arbitrary values (`min-[1150px]:`, `(min-width: 420px)`) are NOT used: when a
 * layout's CSS switches at one width and its JS switches at another, the gap
 * between them is a state nobody designed. Both halves come from here.
 */
export const SCREENS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type ScreenName = keyof typeof SCREENS;

/** `(min-width: Npx)` for `useMediaQuery`, from the same number as the class. */
export function minWidth(name: ScreenName): string {
  return `(min-width: ${SCREENS[name]}px)`;
}
