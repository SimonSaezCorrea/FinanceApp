import { cn } from "../lib/cn";

/** The Andes as seen from Santiago, left to right; the fifth peak (26.8, 18) is the Aconcagua. */
const RIDGE =
  "6,48 9.6,37.8 12.2,41.4 17.4,30 20.6,34.8 26.8,18 30.4,30.6 34.6,25.8 38.2,35.4 42.9,31.2 47.6,39.9 52.3,36.9 58,48";
/** Pencil hatching for the snow under the Aconcagua and its neighbour. */
const SNOW = ["M 24.2 24.6 L 26.4 22.4", "M 24.8 28 L 27.6 25.2", "M 33 29.4 L 34.8 27.6"];

const token = (name: string) => `hsl(var(--${name}))`;

type BrandMarkProps = Readonly<{
  /**
   * `full` adds the snow hatching; meant for ~40px and up. `compact` has heavier strokes and no
   * hatching, for nav sizes and the favicon.
   */
  variant?: "full" | "compact";
  className?: string;
  /** Accessible name. Omit when the brand name is already printed next to it. */
  title?: string;
}>;

/**
 * The "Cuaderno" brand mark: the cordillera outlined in pencil over a ground line, on a rounded
 * tile. Every color comes from the `--logo-*` tokens, so the same markup draws both themes.
 */
export function BrandMark({ variant = "compact", className, title }: BrandMarkProps) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  const full = variant === "full";

  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn("shrink-0", className)} {...a11y}>
      <rect width={64} height={64} rx={14} style={{ fill: token("logo-tile") }} />
      <g strokeLinecap="round" strokeLinejoin="round">
        <polyline
          points={RIDGE}
          style={{ stroke: token("logo-ridge") }}
          strokeWidth={full ? 4 : 5}
        />
        {full && (
          <g style={{ stroke: token("logo-ridge") }} strokeWidth={2}>
            {SNOW.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}
        <line
          x1={8}
          y1={54}
          x2={56}
          y2={54}
          style={{ stroke: token("logo-ground") }}
          strokeWidth={full ? 3 : 4}
        />
      </g>
    </svg>
  );
}
