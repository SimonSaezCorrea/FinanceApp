import { forgetTokenInAddress, postLink, showState, tokenFromLocation } from "./email-link";

/**
 * "Confirma tu correo" landing (specs/032 US1): the page opens, confirms the address with the
 * link's token and says how it went. A missing token is treated like an invalid link.
 */
export async function initVerifyEmail(
  root: ParentNode = document,
  search: string = location.search,
  post: typeof postLink = postLink,
  forget: () => void = forgetTokenInAddress,
): Promise<void> {
  const token = tokenFromLocation(search);
  forget();
  if (!token) {
    showState(root, "invalid");
    return;
  }
  showState(root, "loading");
  const outcome = await post("/auth/email/verify", { token });
  showState(root, outcome === "ok" ? "success" : outcome);
}
