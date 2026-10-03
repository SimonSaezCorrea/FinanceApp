import { useId } from "react";

import { paint } from "./paint";

const STARS: [number, number, number, number][] = [
  [84, 150, 1.4, 0.7],
  [140, 96, 1, 0.5],
  [212, 60, 1.6, 0.8],
  [300, 84, 1, 0.5],
  [376, 122, 1.3, 0.7],
  [430, 180, 1, 0.5],
  [250, 150, 0.9, 0.4],
  [110, 230, 1, 0.4],
  [460, 250, 1.2, 0.5],
];

/** The cordillera at dusk inside an arched window: retro striped sun, stars, three ranges and
 * the hero's ridge line in front. Decorative. */
export function SunsetArch({ className }: Readonly<{ className?: string }>) {
  const id = useId().replaceAll(":", "");
  const grad = (name: string) => `url(#${id}-${name})`;

  return (
    <svg viewBox="0 0 520 660" aria-hidden className={className}>
      <defs>
        <clipPath id={`${id}-arch`}>
          <path d="M0 660 V260 A260 260 0 0 1 520 260 V660 Z" />
        </clipPath>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("background") }} />
          <stop offset="0.45" style={{ stopColor: paint("illus-sky-mid") }} />
          <stop offset="0.7" style={{ stopColor: paint("illus-sky-low") }} />
          <stop offset="0.86" style={{ stopColor: paint("illus-sky-warm") }} />
        </linearGradient>
        <linearGradient id={`${id}-sun`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("illus-sun") }} />
          <stop offset="1" style={{ stopColor: paint("illus-sun-deep") }} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: paint("illus-sun", 0.35) }} />
          <stop offset="1" style={{ stopColor: paint("illus-sun", 0) }} />
        </radialGradient>
        {(["lit", "mid", "shade"] as const).map((tone) => (
          <linearGradient key={tone} id={`${id}-${tone}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: paint(`ridge-${tone}`) }} />
            <stop offset="1" style={{ stopColor: paint("background") }} />
          </linearGradient>
        ))}
      </defs>

      <g clipPath={`url(#${id}-arch)`}>
        <rect width="520" height="660" fill={grad("sky")} />
        {STARS.map(([cx, cy, r, o]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={r}
            style={{ fill: paint("ridge-snow", o) }}
          />
        ))}
        <path
          d="M392 118 a26 26 0 1 0 22 40 a20 20 0 1 1 -22 -40 z"
          style={{ fill: paint("ridge-snow", 0.85) }}
        />

        <circle cx="250" cy="430" r="170" fill={grad("glow")} />
        <circle cx="250" cy="430" r="104" fill={grad("sun")} />
        <g style={{ fill: paint("illus-sun-cut") }}>
          <rect x="120" y="446" width="260" height="4" />
          <rect x="120" y="462" width="260" height="6" />
          <rect x="120" y="480" width="260" height="8" />
          <rect x="120" y="500" width="260" height="10" />
        </g>

        <polygon
          points="0,470 60,420 110,440 170,380 220,408 280,352 330,384 390,330 440,372 520,340 520,660 0,660"
          fill={grad("lit")}
          opacity={0.85}
        />
        <polygon
          points="0,520 80,470 140,488 210,420 250,392 290,428 350,470 410,440 470,468 520,450 520,660 0,660"
          fill={grad("mid")}
        />
        <polygon
          points="210,420 250,392 290,428 272,432 258,420 240,436"
          style={{ fill: paint("ridge-snow") }}
        />
        <polygon
          points="250,392 290,428 272,432 262,410"
          style={{ fill: paint("ridge-snow-shade") }}
        />
        <polygon
          points="0,590 60,560 130,572 190,540 250,556 320,522 380,548 450,530 520,552 520,660 0,660"
          fill={grad("shade")}
        />
        <polyline
          points="0,590 60,560 130,572 190,540 250,556 320,522 380,548 450,530 520,552"
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          style={{ stroke: paint("ridge-line") }}
        />
        <circle
          cx="320"
          cy="522"
          r="5"
          strokeWidth={2.5}
          style={{ fill: paint("background"), stroke: paint("ridge-line") }}
        />
      </g>
      <path
        d="M1 660 V260 A259 259 0 0 1 519 260 V660"
        fill="none"
        strokeWidth={2}
        style={{ stroke: paint("border-2") }}
      />
      <path
        d="M16 660 V262 A244 244 0 0 1 504 262 V660"
        fill="none"
        style={{ stroke: paint("border") }}
      />
    </svg>
  );
}
