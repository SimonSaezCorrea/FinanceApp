/** A theme token as an SVG paint. SVG presentation attributes don't resolve CSS variables, so
 * every fill/stroke/stop in these illustrations goes through `style` with this helper. */
export const paint = (name: string, alpha?: number) =>
  alpha === undefined ? `hsl(var(--${name}))` : `hsl(var(--${name}) / ${alpha})`;

/** A paper strip with torn (zigzag) top and bottom edges, from `x0` to `x1`. */
export function tornPaper(x0: number, x1: number, top: number, bottom: number, tooth = 10) {
  let d = `M${x0} ${top}`;
  let up = true;
  for (let x = x0; x < x1; x += tooth, up = !up)
    d += ` L${x + tooth} ${up ? top - tooth * 0.8 : top}`;
  d += ` L${x1} ${bottom}`;
  up = true;
  for (let x = x1; x > x0; x -= tooth, up = !up)
    d += ` L${x - tooth} ${up ? bottom + tooth * 0.8 : bottom}`;
  return `${d} Z`;
}

/** A four-point sparkle centred on (x, y). */
export const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r} L${x + r * 0.25} ${y - r * 0.25} L${x + r} ${y} L${x + r * 0.25} ${y + r * 0.25} ` +
  `L${x} ${y + r} L${x - r * 0.25} ${y + r * 0.25} L${x - r} ${y} L${x - r * 0.25} ${y - r * 0.25} Z`;
