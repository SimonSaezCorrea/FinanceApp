// Generates the social preview images (public/og/cuadra-{es,en}.png, 1200×630) — run once with
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

const COPY = {
  es: {
    slogan: "La columna de tus finanzas",
    lead: "Cupo, cuotas y facturación como los lleva tu banco.",
  },
  en: {
    slogan: "The backbone of your finances",
    lead: "Credit, instalments and statements the way your bank keeps them.",
  },
};

const W = 1200;
const H = 630;
// The hero's 1440×820 drawing, scaled to the image's width and sat on its bottom edge.
const scale = W / 1440;
const offsetY = H - 772 * scale;

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function svg({ slogan, lead }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0b1518"/>
  <g transform="translate(0 ${offsetY}) scale(${scale})">
    <polygon points="${FAR}" fill="#0f2226"/>
    <polygon points="${RIDGE} 1440,820 0,820" fill="#15393e"/>
    <polyline points="${RIDGE}" fill="none" stroke="#6fd0c8" stroke-width="5" stroke-linejoin="round"/>
  </g>
  <g font-family="Geist, Segoe UI, Helvetica, Arial, sans-serif">
    <text x="80" y="150" font-size="104" font-weight="700" fill="#e6eeee" letter-spacing="-3">Cuadra</text>
    <text x="84" y="214" font-size="40" font-weight="600" fill="#6fd0c8">${escape(slogan)}</text>
    <text x="84" y="270" font-size="28" fill="#9fbfc2">${escape(lead)}</text>
  </g>
</svg>`;
}

const outDir = join(root, "public/og");
mkdirSync(outDir, { recursive: true });
for (const [lang, copy] of Object.entries(COPY)) {
  const png = new Resvg(svg(copy), { font: { loadSystemFonts: true } }).render().asPng();
  writeFileSync(join(outDir, `cuadra-${lang}.png`), png);
  console.log(`og/cuadra-${lang}.png ${png.length} bytes`);
}
