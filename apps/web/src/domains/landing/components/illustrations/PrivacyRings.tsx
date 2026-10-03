import { paint } from "./paint";

/*
 * "Tus datos al centro": five concentric rings around a receipt — one per privacy layer, inside
 * out. `PrivacyRings` is the hero's large drawing with numbered markers; `LayerRings` is the
 * small copy each "capa por capa" row carries, with only its own ring lit.
 */

export const LAYER_COUNT = 5;

/** Ring fills, inside out: the core is the most lit, the outer rings fade into the page. */
const FILLS: [string, number?][] = [
  ["ridge-mid"],
  ["ridge-shade"],
  ["ridge-shade", 0.65],
  ["ridge-far"],
  ["card"],
];

const fill = (index: number) => {
  const [token, alpha] = FILLS[index] ?? ["card"];
  return paint(token, alpha);
};

/** The receipt at the centre, drawn in a box of `size` centred on (cx, cy). */
function Receipt({ cx, cy, size }: Readonly<{ cx: number; cy: number; size: number }>) {
  const w = size;
  const h = size * 1.32;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const row = (dy: number, width: number) => (
    <rect x={x + w * 0.12} y={y + h * dy} width={w * width} height={h * 0.07} rx={h * 0.035} />
  );
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} style={{ fill: paint("illus-paper") }} />
      <path
        d={`M${x} ${y + h * 0.17} V${y + h * 0.07} L${x + w * 0.18} ${y - h * 0.02} L${x + w * 0.32} ${y + h * 0.05} L${x + w * 0.48} ${y - h * 0.08} L${x + w * 0.62} ${y + h * 0.02} L${x + w * 0.78} ${y - h * 0.05} L${x + w} ${y + h * 0.04} V${y + h * 0.17} Z`}
        style={{ fill: paint("illus-seal") }}
      />
      <g style={{ fill: paint("illus-print") }}>
        {row(0.3, 0.45)}
        {row(0.47, 0.34)}
      </g>
      <g style={{ fill: paint("illus-ink") }}>{row(0.72, 0.4)}</g>
    </g>
  );
}

const HERO_RADII = [62, 108, 154, 200, 246];

/** The hero drawing: five rings, the receipt at the centre, numbered markers on a diagonal. */
export function PrivacyRings({
  centerLabel,
  className,
}: Readonly<{ centerLabel: string; className?: string }>) {
  const angle = (-40 * Math.PI) / 180;
  return (
    <svg viewBox="0 0 560 560" aria-hidden className={className}>
      {[...HERO_RADII].reverse().map((r) => {
        const index = HERO_RADII.indexOf(r);
        return (
          <circle
            key={r}
            cx="280"
            cy="280"
            r={r}
            strokeWidth={index === 0 ? 2 : 1.5}
            strokeDasharray={index === 2 ? "3 6" : undefined}
            style={{
              fill: fill(index),
              stroke: paint(index === 0 ? "ridge-line" : index === 1 ? "ridge-lit" : "border-2"),
            }}
          />
        );
      })}
      <Receipt cx={280} cy={276} size={44} />
      <text
        x="280"
        y="332"
        textAnchor="middle"
        className="font-mono"
        fontSize="10.5"
        letterSpacing="0.14em"
        style={{ fill: paint("foreground", 0.85) }}
      >
        {centerLabel.toUpperCase()}
      </text>
      {HERO_RADII.map((r, index) => {
        const last = index === HERO_RADII.length - 1;
        const x = 280 + r * Math.cos(angle);
        const y = 280 + r * Math.sin(angle);
        return (
          <g key={r} className="font-mono" fontSize="12" fontWeight="600" textAnchor="middle">
            <circle
              cx={x}
              cy={y}
              r="14"
              strokeWidth={2.5}
              style={{
                fill: paint("background"),
                stroke: paint(last ? "accent" : "ridge-line"),
              }}
            />
            <text x={x} y={y + 4} style={{ fill: paint(last ? "accent" : "foreground") }}>
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const MINI_RADII = [14, 21, 28, 35, 42];

/** A small copy of the rings with only layer `active` lit (0-based). */
export function LayerRings({
  active,
  className,
}: Readonly<{ active: number; className?: string }>) {
  const last = active === LAYER_COUNT - 1;
  return (
    <svg viewBox="0 0 88 88" aria-hidden className={className}>
      {[...MINI_RADII].reverse().map((r) => {
        const index = MINI_RADII.indexOf(r);
        const on = index === active;
        return (
          <circle
            key={r}
            cx="44"
            cy="44"
            r={r}
            strokeWidth={on ? 3 : 1}
            style={{
              fill: fill(index),
              stroke: paint(on ? (last ? "accent" : "ridge-line") : "border-2"),
            }}
          />
        );
      })}
      <rect x="38" y="36" width="12" height="16" rx="1.5" style={{ fill: paint("illus-paper") }} />
    </svg>
  );
}
