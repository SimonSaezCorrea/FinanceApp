/**
 * `/llms.txt` (llmstxt.org): a plain Markdown map of the public site for language models — what fik
 * is, in a few facts, and every public page with its address and description. Built at build time,
 * like `robots.txt`, from the same titles and descriptions the pages carry, so it can't drift.
 */

export interface LlmsLink {
  title: string;
  url: string;
  description: string;
}

export interface LlmsSection {
  heading: string;
  links: LlmsLink[];
}

export interface LlmsRate {
  /** "UF" or "US dollar (dólar observado)". */
  name: string;
  /** Pesos per unit, as the API returns it. */
  value: string;
  /** The day the source published it (YYYY-MM-DD). */
  valueDate: string;
  url: string;
}

export interface LlmsInput {
  appUrl: string;
  sections: LlmsSection[];
  /** Today's values from the build's snapshot; empty when the build had none. */
  rates: LlmsRate[];
}

/** What fik is, for a model that has never seen it. Facts only: nothing promised that isn't built. */
const SUMMARY =
  "fik is a free personal finance web app for Chile. It tracks bank accounts, credit cards, " +
  "instalment purchases (cuotas), debts, fixed expenses and savings goals in Chilean pesos (CLP), " +
  "US dollars (USD) and UF (CLF), following the rules Chilean banks use.";

const FACTS = [
  "Market: Chile only. Currencies: CLP, USD and UF (CLF).",
  "Credit cards work like the bank's: one shared credit limit (cupo) across the account's cards, " +
    "statements (facturaciones) generated with the dates printed on the bank statement, " +
    "minimum payment, prepayments and instalment plans billed one instalment per statement.",
  "Movements are entered by hand or imported from a spreadsheet (.xlsx or .csv); " +
    "fik does not connect to banks.",
  "Price: free, one plan, no ads and no sale of personal data.",
  "Sign-in: Chilean RUT and password, optionally a passkey and a TOTP second factor.",
  "Languages: Spanish (default) and English.",
  "Exchange rates (dólar observado and UF) come from the Banco Central de Chile's statistics " +
    "database (BDE); the data are the Bank's property.",
];

const line = (link: LlmsLink) => `- [${link.title}](${link.url}): ${link.description}`;

export function llmsText(input: LlmsInput): string {
  const parts = [
    "# fik",
    `> ${SUMMARY}`,
    FACTS.map((fact) => `- ${fact}`).join("\n"),
    `The app itself is at ${input.appUrl} (requires an account; not meant to be crawled).`,
  ];
  if (input.rates.length > 0) {
    parts.push(
      [
        "## Today's indicators",
        ...input.rates.map(
          (rate) =>
            `- [${rate.name}](${rate.url}): ${rate.value} Chilean pesos (value published ${rate.valueDate})`,
        ),
      ].join("\n"),
    );
  }
  for (const section of input.sections) {
    if (section.links.length === 0) continue;
    parts.push([`## ${section.heading}`, ...section.links.map(line)].join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}
