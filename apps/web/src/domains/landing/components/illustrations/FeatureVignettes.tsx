import { type ReactNode, useId } from "react";

import { paint, sparkle } from "./paint";

/** Shared frame of the three feature vignettes: a card-colored tile with a soft glow. */
function Tile({
  glow,
  className,
  children,
}: Readonly<{ glow: string; className?: string; children: ReactNode }>) {
  const id = useId().replaceAll(":", "");
  return (
    <svg viewBox="0 0 580 340" aria-hidden className={className}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: paint(glow, 0.16) }} />
          <stop offset="1" style={{ stopColor: paint(glow, 0) }} />
        </radialGradient>
      </defs>
      <rect width="580" height="340" rx="24" style={{ fill: paint("card") }} />
      <circle cx="290" cy="175" r="170" fill={`url(#${id}-glow)`} />
      {children}
    </svg>
  );
}

/** Two cards, one limit: an additional card tilted behind the main one. */
export function CardsVignette({ className }: Readonly<{ className?: string }>) {
  const id = useId().replaceAll(":", "");
  return (
    <Tile glow="ridge-line" className={className}>
      <defs>
        <linearGradient id={`${id}-front`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("ridge-lit") }} />
          <stop offset="1" style={{ stopColor: paint("ridge-shade") }} />
        </linearGradient>
        <linearGradient id={`${id}-back`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: paint("illus-sun") }} />
          <stop offset="1" style={{ stopColor: paint("illus-sun-deep") }} />
        </linearGradient>
      </defs>
      <g transform="rotate(-10 250 170)">
        <rect x="150" y="96" width="220" height="140" rx="14" fill={`url(#${id}-back)`} />
        <rect
          x="170"
          y="120"
          width="30"
          height="22"
          rx="4"
          style={{ fill: paint("illus-paper", 0.8) }}
        />
      </g>
      <g transform="rotate(6 330 180)">
        <rect
          x="228"
          y="112"
          width="232"
          height="146"
          rx="14"
          fill={`url(#${id}-front)`}
          style={{ stroke: paint("ridge-line", 0.35) }}
        />
        <rect
          x="250"
          y="138"
          width="32"
          height="24"
          rx="4"
          style={{ fill: paint("illus-paper", 0.85) }}
        />
        <polyline
          points="370,160 392,140 404,150 420,128 440,152"
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: paint("illus-paper") }}
        />
        <g style={{ fill: paint("illus-paper", 0.7) }}>
          {[258, 266, 274, 282].map((cx) => (
            <circle key={cx} cx={cx} cy="218" r="2.5" />
          ))}
          <rect x="296" y="214" width="46" height="8" rx="4" />
        </g>
      </g>
      <g style={{ fill: paint("ridge-line", 0.75) }}>
        <path d={sparkle(110, 82, 12)} />
        <path d={sparkle(498, 274, 8)} />
      </g>
    </Tile>
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4];
const WEEKS = [0, 1, 2, 3, 4];

/** A calendar page with the cordillera in its header: a holiday dashed out, closing day ringed. */
export function CalendarVignette({ className }: Readonly<{ className?: string }>) {
  const cell = (col: number, row: number) => ({ x: 204 + col * 27, y: 124 + row * 27 });
  const holiday = cell(2, 1);
  const closing = cell(4, 3);
  return (
    <Tile glow="illus-sun" className={className}>
      <g transform="rotate(-4 290 175)">
        <rect
          x="186"
          y="56"
          width="216"
          height="244"
          rx="16"
          transform="translate(8 10)"
          style={{ fill: paint("illus-shadow", 0.5) }}
        />
        <rect
          x="186"
          y="56"
          width="216"
          height="244"
          rx="16"
          style={{ fill: paint("illus-paper") }}
        />
        <path
          d="M186 72 a16 16 0 0 1 16 -16 h184 a16 16 0 0 1 16 16 v34 h-216 z"
          style={{ fill: paint("illus-seal") }}
        />
        <polyline
          points="206,98 226,80 238,90 256,70 276,94"
          fill="none"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: paint("illus-paper") }}
        />
        <rect x="238" y="46" width="8" height="22" rx="4" style={{ fill: paint("illus-rule") }} />
        <rect x="342" y="46" width="8" height="22" rx="4" style={{ fill: paint("illus-rule") }} />
        {WEEKS.map((row) =>
          [...WEEKDAYS, 5, 6].map((col) => {
            const { x, y } = cell(col, row);
            if (row === 4 && col > 2 && col < 5) return null;
            const weekend = col >= 5;
            const isHoliday = x === holiday.x && y === holiday.y;
            const isClosing = x === closing.x && y === closing.y;
            return (
              <rect
                key={`${col}-${row}`}
                x={x}
                y={y}
                width="20"
                height="20"
                rx="5"
                strokeWidth={isHoliday ? 2 : undefined}
                strokeDasharray={isHoliday ? "3 2" : undefined}
                style={
                  isHoliday
                    ? { fill: "none", stroke: paint("illus-sun-deep") }
                    : {
                        fill: isClosing
                          ? paint("illus-seal")
                          : paint("illus-print", weekend ? 0.45 : 1),
                      }
                }
              />
            );
          }),
        )}
        <circle
          cx={closing.x + 10}
          cy={closing.y + 10}
          r="17"
          fill="none"
          strokeWidth={2.5}
          style={{ stroke: paint("illus-sun") }}
        />
      </g>
      <g style={{ fill: paint("illus-sun", 0.75) }}>
        <path d={sparkle(470, 96, 12)} />
        <path d={sparkle(100, 256, 8)} />
      </g>
    </Tile>
  );
}

/** Three coins — $, US$ and UF — stacked into a small summit. */
export function CoinsVignette({ className }: Readonly<{ className?: string }>) {
  const id = useId().replaceAll(":", "");
  const coins = [
    {
      cx: 205,
      cy: 204,
      from: "ridge-line",
      to: "ridge-lit",
      edge: "ridge-mid",
      ink: "background",
      label: "$",
    },
    {
      cx: 375,
      cy: 198,
      from: "illus-sun",
      to: "illus-sun-deep",
      edge: "illus-coin-edge",
      ink: "illus-ink",
      label: "US$",
    },
    {
      cx: 290,
      cy: 124,
      from: "illus-paper",
      to: "illus-rule",
      edge: "illus-ink-soft",
      ink: "illus-ink",
      label: "UF",
    },
  ];
  return (
    <Tile glow="ridge-line" className={className}>
      <defs>
        {coins.map((coin, index) => (
          <linearGradient key={coin.label} id={`${id}-coin${index}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: paint(coin.from) }} />
            <stop offset="1" style={{ stopColor: paint(coin.to) }} />
          </linearGradient>
        ))}
      </defs>
      <polyline
        points="60,270 150,240 210,250 290,150 370,236 440,220 520,250"
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ stroke: paint("ridge-mid") }}
      />
      {coins.map((coin, index) => (
        <g key={coin.label}>
          <rect
            x={coin.cx - 55}
            y={coin.cy}
            width="110"
            height="26"
            style={{ fill: paint(coin.edge) }}
          />
          <ellipse
            cx={coin.cx}
            cy={coin.cy + 26}
            rx="55"
            ry="18"
            style={{ fill: paint(coin.edge) }}
          />
          <ellipse cx={coin.cx} cy={coin.cy} rx="55" ry="18" fill={`url(#${id}-coin${index})`} />
          <ellipse
            cx={coin.cx}
            cy={coin.cy}
            rx="42"
            ry="12"
            fill="none"
            style={{ stroke: paint("illus-paper", 0.45) }}
          />
          <text
            x={coin.cx}
            y={coin.cy + 5}
            textAnchor="middle"
            className="font-mono"
            fontSize="14"
            fontWeight="600"
            style={{ fill: paint(coin.ink) }}
          >
            {coin.label}
          </text>
        </g>
      ))}
      <g style={{ fill: paint("ridge-line", 0.75) }}>
        <path d={sparkle(120, 102, 12)} />
        <path d={sparkle(470, 118, 8)} />
      </g>
    </Tile>
  );
}
