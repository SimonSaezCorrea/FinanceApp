/**
 * Email preview (specs/032): renders every account email — in Spanish and English — with sample
 * data into a folder outside the repo, plus an index.html linking them all, and prints its path.
 * Sends nothing and touches no database: it only calls the same template functions the API uses.
 *
 *   pnpm --filter @finance/api email:preview
 *
 * The logo travels inside a real email as an inline attachment (`cid:fik-logo`); here it is
 * embedded as a data URI so the files open in any browser on their own.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EmailLocale } from "../src/infra/email/email-sender.port";
import { EMAIL_LOGO_CONTENT_ID } from "../src/infra/email/templates/layout";
import { EMAIL_LOGO_PNG_BASE64 } from "../src/infra/email/templates/logo.generated";
import { renderResetPassword } from "../src/infra/email/templates/reset-password";
import {
  formatNoticeDate,
  renderSecurityNotice,
  type SecurityNoticeKind,
} from "../src/infra/email/templates/security-notice";
import { renderVerifyEmail } from "../src/infra/email/templates/verify-email";

const LOCALES: EmailLocale[] = ["es", "en"];
const NOTICES: SecurityNoticeKind[] = [
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "PASSKEY_ADDED",
  "PASSKEY_REMOVED",
  "EMAIL_CHANGED",
  "ACCOUNT_DELETED",
];
/** What a notice names, when it names something (the passkey, the new address). */
const DETAIL: Partial<Record<SecurityNoticeKind, string>> = {
  PASSKEY_ADDED: "iPhone de Ana",
  PASSKEY_REMOVED: "iPhone de Ana",
  EMAIL_CHANGED: "ana.nueva@ejemplo.cl",
};
const DETAIL_MEANING: Partial<Record<SecurityNoticeKind, string>> = {
  PASSKEY_ADDED: "Nombre de la llave de acceso",
  PASSKEY_REMOVED: "Nombre de la llave de acceso",
  EMAIL_CHANGED: "Dirección nueva de la cuenta",
};

const site = "https://mifik.cl";
const token = "EjemploDeToken_SoloParaVistaPrevia_0123456789";
const outDir = join(tmpdir(), "fik-email-preview");
/** Any fixed instant: the "variables" rendering swaps its formatted text for a marker. */
const SAMPLE_DATE = new Date("2026-10-11T14:30:00Z");

function withEmbeddedLogo(html: string): string {
  return html
    .split(`cid:${EMAIL_LOGO_CONTENT_ID}`)
    .join(`data:image/png;base64,${EMAIL_LOGO_PNG_BASE64}`);
}

/**
 * Every part of an email that is NOT fixed text. `data` changes per email (who, which link,
 * when); `config` comes from the API's environment (the same in every email).
 */
type VariableName = "address" | "link" | "date" | "detail" | "site" | "contact";
interface Variable {
  name: VariableName;
  kind: "data" | "config";
  meaning: string;
}
const VARIABLE_INFO: Record<Exclude<VariableName, "detail">, Omit<Variable, "name">> = {
  address: { kind: "data", meaning: "Dirección a confirmar (la del registro o la nueva)" },
  link: { kind: "data", meaning: "Enlace de un solo uso con el token (48 h o 30 min)" },
  date: { kind: "data", meaning: "Fecha y hora del cambio, en hora de Chile" },
  site: { kind: "config", meaning: "PUBLIC_SITE_URL — dirección del sitio público" },
  contact: { kind: "config", meaning: "EMAIL_REPLY_TO — correo de contacto (pie de cada correo)" },
};

/**
 * A marker that survives HTML escaping and URL contexts unchanged, so it can be found after
 * rendering and drawn as a variable.
 */
const marker = (name: VariableName) => `XVAR${name}XVAR`;

interface Values {
  address: string;
  link: (locale: EmailLocale, page: string) => string;
  detail: (kind: SecurityNoticeKind) => string | undefined;
  site: string;
  contact: string;
}
const SAMPLE: Values = {
  address: "ana@ejemplo.cl",
  link: (locale, page) => `${site}/${locale}/${page}/?token=${token}`,
  detail: (kind) => DETAIL[kind],
  site,
  contact: "contacto@mifik.cl",
};
const MARKERS: Values = {
  address: marker("address"),
  link: () => marker("link"),
  detail: (kind) => (DETAIL[kind] ? marker("detail") : undefined),
  site: marker("site"),
  contact: marker("contact"),
};

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

interface Entry {
  id: string;
  group: "account" | "security";
  name: string;
  variables: Variable[];
  /** Per language: with sample data, with every variable left as a marker, and the sample value
   * of each variable (to draw the sample highlighted). */
  versions: Record<
    EmailLocale,
    { sample: Rendered; vars: Rendered; values: Partial<Record<VariableName, string>> }
  >;
}

/** Human names for the list (the preview is for the team, in Spanish). */
const NOTICE_NAMES: Record<SecurityNoticeKind, string> = {
  PASSWORD_CHANGED: "Contraseña cambiada",
  PASSWORD_RESET: "Contraseña recuperada",
  MFA_ENABLED: "Segundo factor activado",
  MFA_DISABLED: "Segundo factor desactivado",
  PASSKEY_ADDED: "Llave de acceso agregada",
  PASSKEY_REMOVED: "Llave de acceso eliminada",
  EMAIL_CHANGED: "Correo cambiado (a la dirección anterior)",
  ACCOUNT_DELETED: "Cuenta eliminada",
};

function variablesOf(names: VariableName[], detailMeaning?: string): Variable[] {
  return names.map((name) =>
    name === "detail"
      ? { name, kind: "data", meaning: detailMeaning ?? "" }
      : { name, ...VARIABLE_INFO[name] },
  );
}

function versionsOf(
  render: (values: Values, locale: EmailLocale) => Rendered,
  context: { page?: string; kind?: SecurityNoticeKind } = {},
): Entry["versions"] {
  const out = {} as Entry["versions"];
  for (const locale of LOCALES) {
    const sample = render(SAMPLE, locale);
    const vars = render(MARKERS, locale);
    // The date is formatted by the template; swap its text for the marker afterwards.
    const formatted = formatNoticeDate(SAMPLE_DATE, locale);
    const swap = (s: string) => s.split(formatted).join(marker("date"));
    out[locale] = {
      sample: { ...sample, html: withEmbeddedLogo(sample.html) },
      vars: {
        subject: swap(vars.subject),
        html: withEmbeddedLogo(swap(vars.html)),
        text: swap(vars.text),
      },
      values: {
        address: SAMPLE.address,
        link: context.page ? SAMPLE.link(locale, context.page) : undefined,
        date: formatted,
        detail: context.kind ? DETAIL[context.kind] : undefined,
        site: SAMPLE.site,
        contact: SAMPLE.contact,
      },
    };
  }
  return out;
}

const entries: Entry[] = [
  {
    id: "verify-email",
    group: "account",
    name: "Confirma tu correo",
    variables: variablesOf(["address", "link", "contact"]),
    versions: versionsOf(
      (v, locale) =>
        renderVerifyEmail({
          locale,
          siteUrl: v.site,
          contact: v.contact,
          address: v.address,
          link: v.link(locale, "verify-email"),
        }),
      { page: "verify-email" },
    ),
  },
  {
    id: "reset-password",
    group: "account",
    name: "Recupera tu cuenta",
    variables: variablesOf(["link", "contact"]),
    versions: versionsOf(
      (v, locale) =>
        renderResetPassword({
          locale,
          siteUrl: v.site,
          contact: v.contact,
          link: v.link(locale, "reset-password"),
        }),
      { page: "reset-password" },
    ),
  },
  ...NOTICES.map((kind): Entry => ({
    id: `notice-${kind.toLowerCase()}`,
    group: "security",
    name: NOTICE_NAMES[kind],
    variables: variablesOf(
      DETAIL[kind] ? ["detail", "date", "site", "contact"] : ["date", "site", "contact"],
      DETAIL_MEANING[kind],
    ),
    versions: versionsOf(
      (v, locale) =>
        renderSecurityNotice({
          locale,
          siteUrl: v.site,
          contact: v.contact,
          kind,
          occurredAt: SAMPLE_DATE,
          detail: v.detail(kind),
        }),
      { kind },
    ),
  })),
];

/** JSON safe to inline in a <script>: no "</script>" can close it early. */
const manifest = JSON.stringify(entries).replace(/</g, "\\u003c");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), viewer(manifest));
console.log(
  `${entries.length} correos × ${LOCALES.length} idiomas → ${join(outDir, "index.html")}`,
);

/** The viewer: one self-contained page (works from file://; the emails go in via srcdoc). */
function viewer(data: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>fik · correos</title>
<style>
:root{--bg:#0b1518;--side:#0f1e21;--line:#1e2e32;--text:#e6eeee;--muted:#8aa0a2;--brand:#6fb3b8;--chip:#1a2b30}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:grid;grid-template-columns:300px 1fr;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
aside{background:var(--side);border-right:1px solid var(--line);overflow:auto;padding:20px 12px}
aside h1{font-size:15px;margin:0 8px 2px}
aside p{margin:0 8px 18px;color:var(--muted);font-size:12px}
.group{margin:18px 8px 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
button.item{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;padding:8px 10px;border-radius:8px;cursor:pointer;font:inherit}
button.item:hover{background:var(--chip)}
button.item[aria-current=true]{background:var(--chip);box-shadow:inset 3px 0 0 var(--brand)}
.item small{display:block;color:var(--muted);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
main{display:grid;grid-template-rows:auto 1fr;min-width:0;min-height:0}
.bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--line)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.seg button{border:0;background:none;color:var(--muted);padding:6px 12px;cursor:pointer;font:inherit;font-size:13px}
.seg button[aria-pressed=true]{background:var(--chip);color:var(--text)}
.label{font-size:12px;color:var(--muted);margin-right:-4px}
.stage{overflow:auto;padding:24px;display:flex;flex-wrap:wrap;gap:20px;justify-content:center;align-items:flex-start;transition:background .15s}
.stage.light{background:#e9eded}.stage.dark{background:#111}
.mail{flex:1 1 560px;max-width:900px;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.mail.mobile{max-width:375px}
.head{padding:14px 18px;font-size:13px}
.light .head{background:#fff;color:#1f2a2c;border-bottom:1px solid #e3e8e8}
.dark .head{background:#1f1f1f;color:#e8e8e8;border-bottom:1px solid #333}
.head b{font-size:16px;display:block;margin-bottom:4px}
.head span{opacity:.7}
iframe{width:100%;border:0;min-height:400px;display:block}
pre{margin:0;padding:20px;white-space:pre-wrap;font:13px/1.55 ui-monospace,Consolas,monospace}
.light pre{background:#fff;color:#1f2a2c}.dark pre{background:#1f1f1f;color:#e8e8e8}
.legend{flex:0 0 280px;position:sticky;top:0;background:var(--side);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:16px;font-size:12px}
.legend h2{font-size:13px;margin:0 0 12px}
.legend ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.legend li{display:grid;gap:3px}
.legend .meaning{color:var(--muted)}
.legend .sample{font:11px ui-monospace,Consolas,monospace;color:var(--muted);word-break:break-all}
.legend .key{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);display:grid;gap:6px}
</style></head>
<body>
<aside>
  <h1>Correos de fik</h1>
  <p>Vista previa local · no envía nada</p>
  <div id="list"></div>
</aside>
<main>
  <div class="bar">
    <span class="label">Idioma</span><div class="seg" data-key="locale"><button value="es">ES</button><button value="en">EN</button></div>
    <span class="label">Vista</span><div class="seg" data-key="view"><button value="html">HTML</button><button value="text">Texto</button></div>
    <span class="label">Ancho</span><div class="seg" data-key="width"><button value="desktop">Escritorio</button><button value="mobile">Móvil</button></div>
    <span class="label">Bandeja</span><div class="seg" data-key="theme"><button value="light">Clara</button><button value="dark">Oscura</button></div>
    <span class="label">Contenido</span><div class="seg" data-key="content"><button value="sample">Ejemplo</button><button value="vars">Variables</button><button value="clean">Limpio</button></div>
  </div>
  <div class="stage" id="stage"><div class="mail" id="mail"></div><aside class="legend" id="legend"></aside></div>
</main>
<script>
const ENTRIES = ${data};
const GROUPS = { account: "Cuenta", security: "Avisos de seguridad" };
const KEY = "fik-email-preview";
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
const state = Object.assign({ id: ENTRIES[0].id, locale: "es", view: "html", width: "desktop", theme: "light", content: "sample" }, saved);
if (!ENTRIES.some((e) => e.id === state.id)) state.id = ENTRIES[0].id;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Variables are rendered as markers (XVAR<name>XVAR); draw them as chips. Inside an attribute
 * (an href) a chip can't exist, so there it becomes {{name}}. Chips carry inline styles: they go
 * inside the email's own document too. */
const CHIP_STYLE = {
  data: "background:#d7efef;color:#0b4a50;border:1px dashed #2f8f96",
  config: "background:#fde6d9;color:#8a3b17;border:1px dashed #e76f51",
};
function chip(name, variables, values) {
  const v = variables.find((x) => x.name === name) || { kind: "data", meaning: "" };
  const label = values ? esc(values[name] || "") : "{{" + name + "}}";
  return '<span title="{{' + name + "}} · " + esc(v.meaning) + '" style="' + CHIP_STYLE[v.kind] +
    ';font-family:inherit;padding:0 4px;border-radius:5px">' + label + "</span>";
}
/** values = the sample data (shown highlighted), or null (shown as {{name}}). */
function markHtml(html, variables, values) {
  const plain = (name) => (values ? esc(values[name] || "") : "{{" + name + "}}");
  return html
    .replace(/="([^"]*)"/g, (m, value) => '="' + value.replace(/XVAR(\\w+)XVAR/g, (x, name) => plain(name)) + '"')
    .replace(/XVAR(\\w+)XVAR/g, (m, name) => chip(name, variables, values));
}
const markText = (text, variables, values) =>
  esc(text).replace(/XVAR(\\w+)XVAR/g, (m, name) => chip(name, variables, values));

function render() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  document.getElementById("list").innerHTML = Object.entries(GROUPS).map(([g, title]) =>
    '<div class="group">' + title + "</div>" +
    ENTRIES.filter((e) => e.group === g).map((e) =>
      '<button class="item" data-id="' + e.id + '" aria-current="' + (e.id === state.id) + '">' +
      esc(e.name) + "<small>" + esc(e.versions[state.locale].sample.subject) + "</small></button>").join("")).join("");
  for (const seg of document.querySelectorAll(".seg")) {
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(state[seg.dataset.key] === b.value));
  }
  const entry = ENTRIES.find((e) => e.id === state.id);
  const version = entry.versions[state.locale];
  // "sample": sample data, each variable highlighted · "vars": {{name}} · "clean": exactly as sent.
  const clean = state.content === "clean";
  const values = state.content === "sample" ? version.values : null;
  const mail = clean ? version.sample : version.vars;
  const variables = entry.variables.concat([{ name: "address", kind: "data", meaning: "Destinatario" }]);

  document.getElementById("legend").innerHTML =
    "<h2>Variables de este correo</h2><ul>" +
    entry.variables.map((v) =>
      '<li><span><span class="chip ' + v.kind + '">{{' + v.name + "}}</span></span>" +
      '<span class="meaning">' + esc(v.meaning) + "</span>" +
      '<span class="sample">' + esc(version.values[v.name] || "") + "</span></li>").join("") +
    "</ul>" +
    '<div class="key"><span><span class="chip data">dato</span> cambia en cada correo</span>' +
    '<span><span class="chip config">config</span> viene del entorno del API</span>' +
    "<span>Lo demás es texto fijo: apps/api/src/infra/email/i18n</span></div>";

  const inbox = state.theme === "dark" ? "#1f1f1f" : "#ffffff";
  document.getElementById("stage").className = "stage " + state.theme;
  const box = document.getElementById("mail");
  box.className = "mail" + (state.width === "mobile" ? " mobile" : "");
  const subject = clean ? esc(mail.subject) : markText(mail.subject, variables, values);
  const to = clean ? "ana@ejemplo.cl" : chip("address", variables, values && { address: "ana@ejemplo.cl" });
  box.innerHTML = '<div class="head"><b>' + subject + "</b><span>fik &lt;no-reply@mifik.cl&gt; → " + to + "</span></div>";
  if (state.view === "text") {
    const pre = document.createElement("pre");
    if (clean) pre.textContent = mail.text;
    else pre.innerHTML = markText(mail.text, variables, values);
    box.appendChild(pre);
    return;
  }
  const frame = document.createElement("iframe");
  frame.title = mail.subject;
  const html = clean ? mail.html : markHtml(mail.html, variables, values);
  // The inbox's own ground behind the email, as a mail client would paint it.
  frame.srcdoc = html.replace("<body", '<body data-preview style="background:' + inbox + '"');
  frame.onload = () => {
    try { frame.style.height = frame.contentDocument.documentElement.scrollHeight + "px"; } catch { frame.style.height = "900px"; }
  };
  box.appendChild(frame);
}

document.getElementById("list").addEventListener("click", (e) => {
  const b = e.target.closest("button.item");
  if (b) { state.id = b.dataset.id; render(); }
});
for (const seg of document.querySelectorAll(".seg")) {
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { state[seg.dataset.key] = b.value; render(); }
  });
}
render();
</script>
</body></html>`;
}
