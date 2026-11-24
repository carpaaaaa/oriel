# Security

## Reporting a problem

Please report security problems privately, not in a public issue:

- through GitHub's [private vulnerability reporting](https://github.com/carpaaaaa/oriel/security/advisories/new) on this repository, or
- by email to support@charstudio.app, with "Oriel security" in the subject.

Say what you found, how to reproduce it, and which version of Oriel (Settings › About) and of Windows you saw it on. You will get an answer from a person. Please give us a reasonable time to fix it before you make it public.

Oriel is a separate, unofficial port of Search: problems in Oriel's code are Char Studio's, not Office Commun's. Please don't report them to Search's repository.

## Supported versions

Only the latest release gets fixes. Installed copies update themselves; the portable copy doesn't, so download the latest one.

## What to know

The installers and updates aren't code-signed yet, and the updater checks a downloaded installer against the SHA-512 in the release's `latest.yml`, not against a signature. The README's [Security](README.md#security) section says plainly what that means and how to keep updates under your control until signing is in place.
