---
title: Verified passkeys
summary: See which model each physical key is, and unsafe models are no longer accepted.
---

## New

- **Your passkey's verified model**: if you register a physical security key (like a YubiKey) or
  Windows Hello and agree to share its model, we check it against the FIDO Alliance catalog. In
  Profile → Security it shows a "Verified" badge and its model, and the name comes prefilled (you can
  change it).
- **Unsafe models**: if the maker or the FIDO Alliance declares a model unsafe, it can't be
  registered. If one of your keys lands on that list, it stops signing you in and confirming your
  identity, we close the sessions opened with it and email you so you can replace it.

## Changes

- Passkeys from your phone or password manager (iCloud, Google and others) work exactly as before:
  they don't report their model, so they carry no badge.
