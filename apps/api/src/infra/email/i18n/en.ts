import type { EmailCatalog } from "./es";

/** Texts of the emails (specs/032), English. Same keys as `es.ts` (enforced by a parity test). */
export const en: EmailCatalog = {
  layout: {
    footer: "This is an automated email from mifik. Please don't reply to this address.",
    contact: "Questions? Write to us at {contact}.",
    buttonFallback: "If the button doesn't work, copy this link into your browser:",
  },
  verifyEmail: {
    subject: "Confirm your email for mifik",
    preheader: "One click to confirm this address is yours.",
    title: "Confirm your email",
    body: "Tap the button to confirm that {address} is your email. You'll be able to recover your account if you forget your password, and we'll let you know about important changes.",
    button: "Confirm my email",
    expires: "The link expires in 48 hours and works only once.",
    ignore: "If you didn't ask for this, ignore this email: nothing will change.",
  },
  resetPassword: {
    subject: "Choose a new password for mifik",
    preheader: "You asked to recover access to your account.",
    title: "Recover your account",
    body: "We received a request to recover access to your mifik account. Tap the button to choose a new password.",
    button: "Choose a new password",
    expires: "The link expires in 30 minutes and works only once.",
    sessions:
      "Changing it signs you out everywhere. If you use two-step verification, we'll still ask for it.",
    ignore: "If you didn't ask for this, ignore this email: your password stays the same.",
  },
  mfaCode: {
    preheader: "Your code expires in 10 minutes.",
    expires: "It expires in 10 minutes and works only once.",
    neverAsk: "No one from mifik will ever ask you for this code: don't share it with anyone.",
    ignore: "If this wasn't you, ignore this email and change your password.",
    purposes: {
      LOGIN: {
        subject: "Your code to sign in to mifik",
        title: "Sign-in code",
        body: "Someone entered your mifik password. To finish signing in, type this code:",
      },
      ENROLL: {
        subject: "Your code to turn on email verification in mifik",
        title: "Confirm email verification",
        body: "To have your mifik account ask for a code sent to this email when signing in, type this code in your profile:",
      },
      STEP_UP: {
        subject: "Your code to confirm it's you in mifik",
        title: "Confirm it's you",
        body: "To go ahead with a security change in your mifik account, type this code:",
      },
    },
  },
  securityNotice: {
    verifiedModel: "Model verified against the FIDO Alliance catalog: {model}.",
    when: "When: {date} (Chile time).",
    notYou:
      "Wasn't you? Recover your password from mifik's sign-in ({site}) and write to us at {contact}.",
    kinds: {
      PASSWORD_CHANGED: {
        subject: "Your mifik password changed",
        title: "Your password changed",
        body: "Your mifik password was changed from your profile. Your other open sessions were closed.",
      },
      PASSWORD_RESET: {
        subject: "You recovered access to your mifik account",
        title: "You chose a new password",
        body: "A new password was chosen for your mifik account using a recovery link. All open sessions were closed and any pending change of email was cancelled. Your passkeys are still active: check them in Profile, Security, and remove any you don't recognise.",
      },
      MFA_ENABLED: {
        subject: "You turned on two-step verification in mifik",
        title: "Two-step verification on",
        body: "From now on, signing in to mifik with your password also asks for a code: from your authenticator app or sent to your email, depending on the method you chose.",
      },
      MFA_DISABLED: {
        subject: "Two-step verification was turned off in mifik",
        title: "Two-step verification off",
        body: "Your mifik account no longer asks for a code when signing in with a password. Your other open sessions were closed.",
      },
      PASSKEY_ADDED: {
        subject: "You added a passkey to mifik",
        title: "New passkey",
        body: "The passkey “{detail}” was added to your mifik account. It can be used to sign in without a password.",
      },
      PASSKEY_REMOVED: {
        subject: "You removed a passkey from mifik",
        title: "Passkey removed",
        body: "The passkey “{detail}” was removed from your mifik account.",
      },
      EMAIL_CHANGED: {
        subject: "Your mifik account email changed",
        title: "Your email changed",
        body: "Your mifik account email is now {detail}. This address no longer receives our emails and can no longer recover the account.",
      },
      EMAIL_CHANGE_REQUESTED: {
        subject: "A change of your mifik account email was requested",
        title: "A change of your email was requested",
        body: "Someone asked to change your mifik account email to {detail}. The change only happens if the link we sent to that address is opened. If it wasn't you, change your password: that cancels the pending change.",
      },
      IDENTIFIER_CHANGED: {
        subject: "Your mifik account RUT changed",
        title: "Your RUT changed",
        body: "The RUT you use to sign in to mifik and recover your password was changed from your profile. From now on, sign in with the new one.",
      },
      RECOVERY_CODES_REGENERATED: {
        subject: "You generated new recovery codes in mifik",
        title: "New recovery codes",
        body: "10 new recovery codes were generated for your mifik account. The previous ones no longer work. Devices you had remembered will ask for the code again.",
      },
      TRUSTED_DEVICE_ADDED: {
        subject: "You remembered a device in mifik",
        title: "Device remembered",
        body: "“{detail}” won't be asked for the verification code for 30 days when signing in with your password. You can remove it in Profile → Security.",
      },
      PASSKEY_COMPROMISED: {
        subject: "One of your mifik passkeys is no longer safe",
        title: "Passkey compromised",
        body: "The model of your passkey \u00ab{detail}\u00bb was declared compromised by its maker or the FIDO Alliance. It no longer signs you in nor confirms your identity, and we closed the sessions opened with it. Remove it from Profile → Security and add another one if you like.",
      },
      MFA_METHOD_CHANGED: {
        subject: "You changed your two-step verification in mifik",
        title: "Verification method changed",
        body: "The way your mifik account asks for the second step when signing in was changed. Devices you had remembered will ask for the code again.",
      },
      ACCOUNT_DELETED: {
        subject: "You deleted your mifik account",
        title: "Your account was deleted",
        body: "Your mifik account was deleted at your request. It can no longer be used to sign in.",
      },
    },
  },
};
