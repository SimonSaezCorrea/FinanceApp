import type { EmailCatalog } from "./es";

/** Texts of the emails (specs/032), English. Same keys as `es.ts` (enforced by a parity test). */
export const en: EmailCatalog = {
  layout: {
    footer: "This is an automated email from fik. Please don't reply to this address.",
    contact: "Questions? Write to us at {contact}.",
    buttonFallback: "If the button doesn't work, copy this link into your browser:",
  },
  verifyEmail: {
    subject: "Confirm your email for fik",
    preheader: "One click to confirm this address is yours.",
    title: "Confirm your email",
    body: "Tap the button to confirm that {address} is your email. You'll be able to recover your account if you forget your password, and we'll let you know about important changes.",
    button: "Confirm my email",
    expires: "The link expires in 48 hours and works only once.",
    ignore: "If you didn't ask for this, ignore this email: nothing will change.",
  },
  resetPassword: {
    subject: "Choose a new password for fik",
    preheader: "You asked to recover access to your account.",
    title: "Recover your account",
    body: "We received a request to recover access to your fik account. Tap the button to choose a new password.",
    button: "Choose a new password",
    expires: "The link expires in 30 minutes and works only once.",
    sessions:
      "Changing it signs you out everywhere. If you use two-step verification, we'll still ask for it.",
    ignore: "If you didn't ask for this, ignore this email: your password stays the same.",
  },
  securityNotice: {
    when: "When: {date} (Chile time).",
    notYou:
      "Wasn't you? Recover your password from fik's sign-in ({site}) and write to us at {contact}.",
    kinds: {
      PASSWORD_CHANGED: {
        subject: "Your fik password changed",
        title: "Your password changed",
        body: "Your fik password was changed from your profile. Your other open sessions were closed.",
      },
      PASSWORD_RESET: {
        subject: "You recovered access to your fik account",
        title: "You chose a new password",
        body: "A new password was chosen for your fik account using a recovery link. All open sessions were closed.",
      },
      MFA_ENABLED: {
        subject: "You turned on two-step verification in fik",
        title: "Two-step verification on",
        body: "From now on, signing in to fik with your password also asks for a code from your authenticator app.",
      },
      MFA_DISABLED: {
        subject: "Two-step verification was turned off in fik",
        title: "Two-step verification off",
        body: "Your fik account no longer asks for a code when signing in with a password. Your other open sessions were closed.",
      },
      PASSKEY_ADDED: {
        subject: "You added a passkey to fik",
        title: "New passkey",
        body: "The passkey “{detail}” was added to your fik account. It can be used to sign in without a password.",
      },
      PASSKEY_REMOVED: {
        subject: "You removed a passkey from fik",
        title: "Passkey removed",
        body: "The passkey “{detail}” was removed from your fik account.",
      },
      EMAIL_CHANGED: {
        subject: "Your fik account email changed",
        title: "Your email changed",
        body: "Your fik account email is now {detail}. This address no longer receives our emails and can no longer recover the account.",
      },
      ACCOUNT_DELETED: {
        subject: "You deleted your fik account",
        title: "Your account was deleted",
        body: "Your fik account was deleted at your request. It can no longer be used to sign in.",
      },
    },
  },
};
