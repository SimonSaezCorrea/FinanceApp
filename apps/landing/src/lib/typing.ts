import type { Language } from "./language";

const separators = (lang: Language) =>
  lang === "es" ? { dec: ",", grp: "." } : { dec: ".", grp: "," };

/** "1234567" → "1.234.567". A loop, not a lookahead regex: a pasted number can be very long. */
function groupThousands(digits: string, grp: string): string {
  let out = "";
  for (let end = digits.length; end > 0; end -= 3) {
    const part = digits.slice(Math.max(0, end - 3), end);
    out = out ? `${part}${grp}${out}` : part;
  }
  return out;
}

/** A plain decimal string ("139589.38") written for the language: "139.589,38" / "139,589.38".
 * Every decimal is kept. */
export function groupDecimal(plain: string, lang: Language): string {
  const { dec, grp } = separators(lang);
  const [int = "", frac] = plain.split(".");
  return groupThousands(int, grp) + (frac ? dec + frac : "");
}

/**
 * The converter's fields group thousands AS YOU TYPE (spec 033): "150000000" reads "150.000.000"
 * the moment it is typed, not when the field loses focus. Pure and without `decimal.js`, so it
 * runs on every keystroke from the first one. The caret stays after the same digit it was after.
 *
 * Spanish writes "1.500,25", English "1,500.25". In Spanish a dot TYPED right before the caret is
 * the decimal point; in PASTED text, a lone dot not followed by exactly three digits ("1.5") is too.
 * That second rule never applies while typing: the field's own grouping dots would trip it
 * ("1.000" plus a digit is "1.0000", which is ten thousand). Decimals are kept as typed, as many as
 * typed (clarified 2026-10-21), never rounded.
 */
export function formatWhileTyping(
  raw: string,
  caret: number,
  lang: Language,
  how: { typedPoint?: boolean; pasted?: boolean } = {},
): { value: string; caret: number } {
  const { dec, grp } = separators(lang);
  let s = raw;
  if (lang === "es" && !s.includes(",")) {
    if (how.typedPoint && s[caret - 1] === ".") s = `${s.slice(0, caret - 1)},${s.slice(caret)}`;
    else if (how.pasted && /^\d+\.(\d{1,2}|\d{4,})$/.test(s)) s = s.replace(".", ",");
  }

  const decAt = s.indexOf(dec);
  const hasDec = decAt >= 0;
  let intDigits = (hasDec ? s.slice(0, decAt) : s).replace(/\D/g, "");
  const decDigits = hasDec ? s.slice(decAt + 1).replace(/\D/g, "") : "";
  intDigits = intDigits.replace(/^0+(?=\d)/, "");
  if (hasDec && intDigits === "") intDigits = "0";
  const value = groupThousands(intDigits, grp) + (hasDec ? dec + decDigits : "");
  return { value, caret: caretAfter(s, caret, value, hasDec ? decAt : -1, dec) };
}

/** The caret goes after as many digits as it was after: past the decimal point, counted from it;
 * before it, counted along the integer part. */
function caretAfter(s: string, caret: number, value: string, decAt: number, dec: string): number {
  if (decAt >= 0 && caret > decAt) {
    const decimalsBefore = s.slice(decAt + 1, caret).replace(/\D/g, "").length;
    return Math.min(value.indexOf(dec) + 1 + decimalsBefore, value.length);
  }
  const digitsBefore = s.slice(0, caret).replace(/\D/g, "").length;
  let pos = 0;
  for (let count = 0; pos < value.length && count < digitsBefore; pos++) {
    if (/\d/.test(value[pos]!)) count++;
  }
  return pos;
}
