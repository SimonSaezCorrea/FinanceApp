---
title: An email change you didn't ask for can be stopped
summary: We tell you when someone asks to change your email, and changing your password cancels it.
---

## Security

- **A notice when a change of email is requested**: we write to your current email as soon as
  someone asks to change it, not only once the change has happened.
- **Changing your password cancels it**: changing or recovering your password voids any pending
  change of email, and its link stops working.
- **Limits on repeated attempts**: signing in, creating an account, recovering your password,
  importing and uploading receipts have a maximum of attempts in a row. If you reach it, you wait
  a few minutes.
- **Locks that end**: when a lock for wrong two-step verification codes ends, the account starts
  from zero.
- **Always an encrypted connection**: your browser remembers that mifik only opens over a secure
  connection, even if you type the address without "https".
- **Replace everything asks you to confirm it is you**: before deleting your data to import the
  template, as when changing your email.
- **Each verification code works once**: a code from your authenticator app can no longer be used
  twice.
- **Sessions that end**: a session closes after 30 days even if you keep using it, and if someone
  tries to use an old copy of it, it closes at once.

## Stability

- **Fewer passing connection errors**: if the server briefly can't find the API, it now still
  answers instead of giving you an error after a wait.
