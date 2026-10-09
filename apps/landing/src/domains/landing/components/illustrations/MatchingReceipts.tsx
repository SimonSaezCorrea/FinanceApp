import { useId } from "react";

import { paint, tornPaper } from "./paint";

/** Row lengths shared by both receipts — they "cuadran" line by line. [label, amount] widths. */
const ROWS: [number, number][] = [
  [92, 40],
  [70, 48],
  [110, 34],
  [60, 44],
  [84, 38],
];
const BANK = tornPaper(40, 230, 70, 400);
const APP = tornPaper(290, 480, 70, 400);
const CROWN = "M290 106 V92 L318 78 L334 88 L352 70 L368 82 L386 66 L404 84 L420 76 L480 94 V106 Z";

/** Two receipts side by side — your bank's statement and Cuadra's — joined row by row by dotted
 * lines, with a check under them: the name, drawn. Nothing on them is a figure. Decorative
 * (`aria-hidden`), captions included — the page's own copy says the same in words. */
export function MatchingReceipts({
  bankLabel,
  appLabel,
  className,
}: Readonly<{ bankLabel: string; appLabel: string; className?: string }>) {
  const id = useId().replaceAll(":", "");

  return (
    <svg viewBox="0 0 520 490" aria-hidden className={className}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: paint("ridge-line", 0.16) }} />
          <stop offset="1" style={{ stopColor: paint("ridge-line", 0) }} />
        </radialGradient>
      </defs>
      <circle cx="260" cy="250" r="250" fill={`url(#${id}-glow)`} />

      {[BANK, APP].map((d) => (
        <g key={d}>
          <path d={d} transform="translate(10 14)" style={{ fill: paint("illus-shadow", 0.6) }} />
          <path d={d} style={{ fill: paint("illus-paper") }} />
        </g>
      ))}
      <rect x="40" y="70" width="190" height="36" style={{ fill: paint("illus-ink") }} />
      <rect x="56" y="84" width="70" height="8" rx="4" style={{ fill: paint("illus-rule") }} />
      <path d={CROWN} style={{ fill: paint("illus-seal") }} />
      <polygon points="352,70 368,82 360,84 352,78 344,84" style={{ fill: paint("illus-paper") }} />

      {ROWS.map(([label, amount], index) => {
        const y = 140 + index * 38;
        return (
          <g key={y}>
            <rect
              x="56"
              y={y}
              width={label}
              height="9"
              rx="4.5"
              style={{ fill: paint("illus-print") }}
            />
            <rect
              x={214 - amount}
              y={y}
              width={amount}
              height="9"
              rx="4.5"
              style={{ fill: paint("illus-rule") }}
            />
            <line
              x1="232"
              y1={y + 4.5}
              x2="288"
              y2={y + 4.5}
              strokeWidth={2}
              strokeDasharray="2 5"
              strokeLinecap="round"
              style={{ stroke: paint("ridge-line") }}
            />
            <rect
              x="306"
              y={y}
              width={label}
              height="9"
              rx="4.5"
              style={{ fill: paint("illus-print") }}
            />
            <rect
              x={464 - amount}
              y={y}
              width={amount}
              height="9"
              rx="4.5"
              style={{ fill: paint("ridge-lit") }}
            />
          </g>
        );
      })}

      <g strokeDasharray="3 5" style={{ stroke: paint("illus-rule") }}>
        <line x1="56" y1="340" x2="214" y2="340" />
        <line x1="306" y1="340" x2="464" y2="340" />
      </g>
      <g style={{ fill: paint("illus-ink") }}>
        <rect x="56" y="360" width="70" height="12" rx="6" />
        <rect x="160" y="358" width="54" height="16" rx="8" />
        <rect x="306" y="360" width="70" height="12" rx="6" />
      </g>
      <rect x="410" y="358" width="54" height="16" rx="8" style={{ fill: paint("illus-seal") }} />
      <line
        x1="232"
        y1="366"
        x2="288"
        y2="366"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ stroke: paint("ridge-line") }}
      />

      <circle cx="260" cy="452" r="26" style={{ fill: paint("ridge-line") }} />
      <path
        d="M249 452 l8 8 15 -17"
        fill="none"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: paint("background") }}
      />
      <g
        className="font-mono"
        fontSize="12"
        letterSpacing="0.12em"
        textAnchor="middle"
        style={{ fill: paint("muted-foreground") }}
      >
        <text x="135" y="466">
          {bankLabel.toUpperCase()}
        </text>
        <text x="385" y="466">
          {appLabel.toUpperCase()}
        </text>
      </g>
    </svg>
  );
}
