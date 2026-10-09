import { cn } from "../lib/cn";

/** Top edge of the receipt: the Andes, closing into a rounded-bottom ticket. */
const BODY =
  "M 90 170 L 120 136 L 138 150 L 178 86 L 204 130 L 222 116 L 248 146 L 274 118 L 298 138 L 322 124 L 350 170 L 350 352 Q 350 372 330 372 L 110 372 Q 90 372 90 352 Z";
/** Snow on the highest peak. */
const CAP = "M 178 86 L 192 110 L 184 106 L 178 114 L 172 106 L 164 110 Z";

const token = (name: string) => `hsl(var(--${name}))`;

type BrandMarkProps = Readonly<{
  /**
   * `full` — the whole mark (printed rows, total, carried-over amount and its arrow); meant for
   * ~48px and up. `compact` — outline, snow and total only, with a heavier stroke; for nav sizes.
   */
  variant?: "full" | "compact";
  className?: string;
  /** Accessible name. Omit when the brand name is already printed next to it. */
  title?: string;
}>;

/**
 * The "Cordillera" brand mark (design 2A). Every color comes from the `--logo-*` tokens, so the
 * same markup draws the dark outlined receipt and its light-theme counterpart.
 */
export function BrandMark({ variant = "compact", className, title }: BrandMarkProps) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  const body = (
    <path
      d={BODY}
      style={{
        // The compact cut is line-only: no ticket fill, so it sits on any ground (tab bar, nav).
        fill: variant === "compact" ? "none" : token("logo-body"),
        stroke: token("logo-outline"),
      }}
      strokeWidth={variant === "compact" ? 22 : 6}
      strokeLinejoin="round"
    />
  );
  const cap = <path d={CAP} style={{ fill: token("logo-cap") }} />;

  if (variant === "compact") {
    return (
      <svg viewBox="70 68 300 318" fill="none" className={cn("shrink-0", className)} {...a11y}>
        {body}
        {cap}
        <line
          x1={130}
          y1={300}
          x2={260}
          y2={300}
          style={{ stroke: token("logo-total") }}
          strokeWidth={26}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="60 50 360 360" fill="none" className={cn("shrink-0", className)} {...a11y}>
      {body}
      {cap}
      <g style={{ stroke: token("logo-rule") }} strokeWidth={10} strokeLinecap="round">
        <line x1={124} y1={222} x2={300} y2={222} />
        <line x1={124} y1={256} x2={258} y2={256} />
      </g>
      <g strokeLinecap="round">
        <line
          x1={124}
          y1={318}
          x2={236}
          y2={318}
          style={{ stroke: token("logo-total") }}
          strokeWidth={14}
        />
        <g style={{ stroke: token("logo-carry") }}>
          <line x1={266} y1={318} x2={316} y2={318} strokeWidth={14} />
          <path d="M 350 318 L 398 318" strokeWidth={5} strokeDasharray="1 12" />
          <path d="M 390 305 L 405 318 L 390 331" strokeWidth={5} strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}
