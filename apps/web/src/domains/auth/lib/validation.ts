import { auth } from "@finance/contracts";

/** i18n key of each validation message (under `auth.validation.*`). */
export type ValidationError =
  | "required"
  | "rut"
  | "email"
  | "passwordLength"
  | "passwordLetterNumber"
  | "passwordIsRut"
  | "birthDateFuture";

/** Same minimum the API's register schema enforces. */
export const PASSWORD_MIN_LENGTH = 8;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** RUT with a valid check digit — the same `isValidRut` (módulo 11) the API validates with. */
export function validateRut(value: string): ValidationError | null {
  if (!value.trim()) return "required";
  return auth.isValidRut(value) ? null : "rut";
}

export function validateRequired(value: string): ValidationError | null {
  return value.trim() ? null : "required";
}

export function validateEmail(value: string): ValidationError | null {
  if (!value.trim()) return "required";
  return EMAIL_RE.test(value.trim()) ? null : "email";
}

/** Each rule of a new password, for the live checklist. Only `length` is enforced by the API;
 * `letterNumber` and `notRut` are this form's own floor (a RUT is the login, so it can't also be
 * the password); `symbol` is only a recommendation. */
export function passwordRules(password: string, rut: string) {
  const rutDigits = rut.replace(/[^0-9kK]/g, "");
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letterNumber: /[a-zA-ZñÑ]/.test(password) && /\d/.test(password),
    symbol: /[^a-zA-Z0-9ñÑ]/.test(password),
    notRut:
      !password ||
      rutDigits.length < 7 ||
      !password.replace(/[^0-9kK]/g, "").includes(rutDigits.slice(0, -1)),
  };
}

export function validateNewPassword(value: string, rut = ""): ValidationError | null {
  if (!value) return "required";
  const rules = passwordRules(value, rut);
  if (!rules.length) return "passwordLength";
  if (!rules.letterNumber) return "passwordLetterNumber";
  if (!rules.notRut) return "passwordIsRut";
  return null;
}

export function validateBirthDate(value: string): ValidationError | null {
  if (!value) return "required";
  return value > new Date().toISOString().slice(0, 10) ? "birthDateFuture" : null;
}
