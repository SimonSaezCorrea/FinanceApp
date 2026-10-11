// Generates the social preview images (public/og/fik-{es,en}.png, 1200×630) — run once with
// `node scripts/og.mjs` and commit the result (spec 031, research R11). The cordillera comes from
// the home hero's own geometry (src/domains/landing/lib/ridgeGeometry.ts), read as text so there
// is one source; the colors are the dark theme's --ridge-* / --logo-* tokens.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const geometry = readFileSync(join(root, "src/domains/landing/lib/ridgeGeometry.ts"), "utf8");
const constant = (name) => {
  const match = geometry.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`));
  if (!match) throw new Error(`${name} not found in ridgeGeometry.ts`);
  return match[1];
};
const RIDGE = constant("RIDGE_LINE");
const FAR = constant("FAR_RANGE");
// The logo (packages/ui brand-logo.tsx, "Cuaderno"): the Andes sketched above "fik" at 112px.
const ANDES = [
  [0, 0],
  [0.07, 0.34],
  [0.12, 0.22],
  [0.22, 0.6],
  [0.28, 0.44],
  [0.4, 1],
  [0.47, 0.58],
  [0.55, 0.74],
  [0.62, 0.42],
  [0.71, 0.56],
  [0.8, 0.27],
  [0.89, 0.37],
  [1, 0],
];
const PEAKS = ANDES.map(([f, k]) => [-6 + 120 * f, -84 - 48 * k]);
const LOGO_RIDGE = PEAKS.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const LOGO_SNOW = ANDES.flatMap(([, k], i) => {
  if (k < 0.5 || i === 0 || i === ANDES.length - 1) return [];
  const [x, y] = PEAKS[i];
  return [0, 6, 12].map((d) => {
    const sy = y + 9 + d * 0.9;
    return `M ${(x - 6 + d * 0.3).toFixed(1)} ${(sy + 3).toFixed(1)} L ${(x - 1 + d * 0.6).toFixed(1)} ${(sy - 1).toFixed(1)}`;
  });
}).join(" ");

const COPY = {
  es: {
    slogan: "La columna que hace cuadrar tus finanzas",
    lead: "Cupo, cuotas y facturación como los lleva tu banco.",
  },
  en: {
    slogan: "The backbone that keeps your finances balanced",
    lead: "Credit, instalments and statements the way your bank keeps them.",
  },
};

const W = 1200;
const H = 630;
// The hero's 1440×820 drawing, scaled to the image's width and sat 70px below its bottom edge, so
// the summit stays clear of the longest slogan (English).
const scale = W / 1440;
const offsetY = H - 772 * scale + 70;

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function svg({ slogan, lead }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0b1518"/>
  <g transform="translate(0 ${offsetY}) scale(${scale})">
    <polygon points="${FAR}" fill="#0f2226"/>
    <polygon points="${RIDGE} 1440,820 0,820" fill="#15393e"/>
    <polyline points="${RIDGE}" fill="none" stroke="#6fd0c8" stroke-width="5" stroke-linejoin="round"/>
  </g>
  <defs>
    <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/>
    </filter>
  </defs>
  <g transform="translate(84 168) scale(0.85)">
    <g filter="url(#pencil)" fill="none" stroke="#6fb3b8" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="${LOGO_RIDGE}" stroke-width="4"/>
      <path d="${LOGO_SNOW}" stroke-width="2"/>
    </g>
    <text x="0" y="0" font-family="Caveat Brush" font-size="112" fill="#e6eeee">fik</text>
  </g>
  <g font-family="Geist, Segoe UI, Helvetica, Arial, sans-serif">
    <text x="84" y="214" font-size="40" font-weight="600" fill="#6fd0c8">${escape(slogan)}</text>
    <text x="84" y="262" font-size="28" fill="#9fbfc2">${escape(lead)}</text>
  </g>
</svg>`;
}

const outDir = join(root, "public/og");
mkdirSync(outDir, { recursive: true });
for (const [lang, copy] of Object.entries(COPY)) {
  const png = new Resvg(svg(copy), {
    font: {
      fontFiles: [join(root, "scripts/fonts/CaveatBrush-Regular.ttf")],
      loadSystemFonts: true,
    },
  })
    .render()
    .asPng();
  writeFileSync(join(outDir, `fik-${lang}.png`), png);
  console.log(`og/fik-${lang}.png ${png.length} bytes`);
}

// The logo at the top of every email (specs/032): the same drawing, light palette (most inboxes
// are white), transparent background, 2x the 120px it is shown at. It travels INSIDE each email as
// an inline image (cid:), so it shows in any inbox without fetching it from the site — written as a
// base64 module of the API, which attaches it.
const emailLogoModule = join(root, "../api/src/infra/email/templates/logo.generated.ts");
const emailLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="270" viewBox="-10 -138 128 144">
  <defs>
    <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/>
    </filter>
  </defs>
  <g filter="url(#pencil)" fill="none" stroke="#0e3b40" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="${LOGO_RIDGE}" stroke-width="4"/>
    <path d="${LOGO_SNOW}" stroke-width="2"/>
  </g>
  <text x="0" y="0" font-family="Caveat Brush" font-size="112" fill="#0e1f22">fik</text>
</svg>`;
const logoPng = new Resvg(emailLogo, {
  font: {
    fontFiles: [join(root, "scripts/fonts/CaveatBrush-Regular.ttf")],
    loadSystemFonts: false,
  },
})
  .render()
  .asPng();
writeFileSync(
  emailLogoModule,
  `// Generated by apps/landing/scripts/og.mjs — do not edit. The email logo as base64 PNG.
export const EMAIL_LOGO_PNG_BASE64 =
  "${logoPng.toString("base64")}";
`,
);
console.log(
  `email logo ${logoPng.length} bytes → apps/api/src/infra/email/templates/logo.generated.ts`,
);
