import { useId } from "react";

import { cn } from "../../../shared/lib/cn";
import {
  FAR_RANGE,
  RIDGE_END,
  RIDGE_FACES,
  RIDGE_LINE,
  RIDGE_SUMMIT,
  RIDGE_VIEWBOX,
} from "../lib/ridgeGeometry";

const token = (name: string) => `hsl(var(--${name}))`;

const { width: WIDTH, baseline: BASELINE } = RIDGE_VIEWBOX;
/** The viewBox is trimmed to just above the summit and to the baseline: nothing but sky is lost. */
const TOP = RIDGE_SUMMIT.y - 24;
const HEIGHT = BASELINE - TOP;

/**
 * The hero's background: a line chart whose line is the ridge of a faceted mountain range —
 * Cuadra's cordillera read as a balance climbing to a summit. Purely decorative (`aria-hidden`).
 *
 * The drawing STRETCHES to whatever box `className` gives it (`preserveAspectRatio="none"`), so
 * the range always runs edge to edge at a height of the caller's choosing; strokes keep their
 * width (`non-scaling-stroke`) and the summit and end markers are HTML dots placed by percentage, since an
 * SVG circle would stretch into an ellipse.
 */
export function HeroRidge({ className }: Readonly<{ className?: string }>) {
  const id = useId().replaceAll(":", "");
  const clip = `M 0,${BASELINE} L ${RIDGE_LINE.replaceAll(" ", " L ")} L ${WIDTH},${BASELINE} Z`;

  return (
    <div aria-hidden className={cn("pointer-events-none relative", className)}>
      <svg
        viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <path d={clip} />
          </clipPath>
          {(["lit", "mid", "shade"] as const).map((tone) => (
            <linearGradient key={tone} id={`${id}-${tone}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: token(`ridge-${tone}`) }} />
              <stop offset="1" style={{ stopColor: token("background") }} />
            </linearGradient>
          ))}
        </defs>

        <polygon points={FAR_RANGE} style={{ fill: token("ridge-far") }} />

        <g clipPath={`url(#${id}-clip)`}>
          <rect x={0} y={0} width={WIDTH} height={BASELINE} fill={`url(#${id}-shade)`} />
          {RIDGE_FACES.map((face) => (
            <g key={face.lit}>
              <polygon points={face.shadow} fill={`url(#${id}-shade)`} />
              <polygon points={face.lit} fill={`url(#${id}-lit)`} />
              <polygon points={face.crease} fill={`url(#${id}-mid)`} />
              <polygon points={face.snow} style={{ fill: token("ridge-snow") }} />
              <polygon points={face.snowShade} style={{ fill: token("ridge-snow-shade") }} />
            </g>
          ))}
        </g>

        {/* The chart line: a soft halo under a crisp stroke. */}
        <g style={{ stroke: token("ridge-line") }} strokeLinejoin="round" strokeLinecap="round">
          <polyline
            points={RIDGE_LINE}
            strokeOpacity={0.22}
            strokeWidth={8}
            vectorEffect="non-scaling-stroke"
          />
          <polyline points={RIDGE_LINE} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>

      <span
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-background"
        style={{
          left: `${(RIDGE_SUMMIT.x / WIDTH) * 100}%`,
          top: `${((RIDGE_SUMMIT.y - TOP) / HEIGHT) * 100}%`,
          borderColor: token("ridge-line"),
        }}
      />
      <span
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${(RIDGE_END.x / WIDTH) * 100}%`,
          top: `${((RIDGE_END.y - TOP) / HEIGHT) * 100}%`,
          backgroundColor: token("ridge-line"),
        }}
      />
    </div>
  );
}
