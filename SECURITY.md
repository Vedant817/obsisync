# Security

Sealed Sync encrypts each note on the device with AES-256-GCM before upload. The hosted API stores ciphertext. The vault key and the recovery phrase stay on your devices.

## Report a vulnerability

Open a private report with GitHub Security Advisories on [Vedant817/obsisync](https://github.com/Vedant817/obsisync/security/advisories/new). Do not open a public issue for a vulnerability.

Do not include a recovery phrase, a device token, a pairing code, a Turso token, or the text of a note.

## What to keep private

- The pairing QR and the recovery phrase. Anyone who has both can join the vault until the invite expires.
- `.obsidian/plugins/obsisync/data.json`. It holds this device's login.
- `apps/worker/.env` and `.bootstrap-credential`. They are credentials for the API database.

A wrong recovery phrase uses up that pairing code. Create a new code, then revoke the unused device from Refresh vault info.
