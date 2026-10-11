import { postLink, showState, tokenFromLocation } from "./email-link";

/** The API's own floor for a password (same as registration). */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordProblem = "tooShort" | "mismatch" | null;

export function passwordProblem(password: string, confirmation: string): PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) return "tooShort";
  if (password !== confirmation) return "mismatch";
  return null;
}

/**
 * "Elige una contraseña nueva" (specs/032 US2): a plain form — no React — that sends the link's
 * token with the new password. Success never signs in: the person goes to sign in with it (and
 * their second factor, if any). The token is checked only on submit, so an opened-but-unused link
 * is never spent by just looking at the page.
 */
export function initResetPassword(
  root: ParentNode = document,
  search: string = location.search,
  post: typeof postLink = postLink,
): void {
  const token = tokenFromLocation(search);
  if (!token) {
    showState(root, "invalid");
    return;
  }
  showState(root, "form");

  const form = root.querySelector<HTMLFormElement>("form[data-reset-form]");
  const problemEl = root.querySelector<HTMLElement>("[data-problem]");
  const submit = form?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!form || !problemEl || !submit) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    const problem = passwordProblem(password, confirmation);
    if (problem) {
      problemEl.textContent = problemEl.dataset[problem] ?? "";
      problemEl.hidden = false;
      return;
    }
    problemEl.hidden = true;
    submit.disabled = true;
    void post("/auth/password/reset", { token, newPassword: password }).then((outcome) => {
      submit.disabled = false;
      if (outcome === "ok") showState(root, "success");
      else if (outcome === "invalid") showState(root, "invalid");
      else {
        problemEl.textContent = problemEl.dataset.error ?? "";
        problemEl.hidden = false;
      }
    });
  });
}
