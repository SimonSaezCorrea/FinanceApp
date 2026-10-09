import { useId } from "react";

import { paint } from "./paint";

/** The ridge in front of a retro sun on the horizon, cut by three bands. The bands are painted
 * with `--surface-2`, the color of the band this sits on, so they read as gaps. Decorative. */
export function StripedSun({ className }: Readonly<{ className?: string }>) {
  const id = useId().replaceAll(":", "");

  return (
    <svg viewBox="0 0 240 132" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("illus-sun") }} />
          <stop offset="0.55" style={{ stopColor: paint("illus-sky-warm") }} />
          <stop offset="1" style={{ stopColor: paint("illus-sky-mid") }} />
        </linearGradient>
      </defs>
      <path d="M30 118 A90 90 0 0 1 210 118 Z" fill={`url(#${id}-sun)`} />
      <g style={{ fill: paint("surface-2") }}>
        <rect x="20" y="86" width="200" height="3" />
        <rect x="20" y="97" width="200" height="4.5" />
        <rect x="20" y="107" width="200" height="6" />
      </g>
      <polygon
        points="0,132 0,112 38,96 62,106 96,78 124,100 150,90 184,104 212,92 240,108 240,132"
        style={{ fill: paint("ridge-shade") }}
      />
      <polyline
        points="0,112 38,96 62,106 96,78 124,100 150,90 184,104 212,92 240,108"
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ stroke: paint("ridge-line") }}
      />
    </svg>
  );
}
