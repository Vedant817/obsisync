# Changelog

## 0.2.1

- A device that already has the same note bytes as the server keeps that note in place. ObsiSync no longer writes a second `.vb-conflict-` copy for identical content.
- Divergent edits still keep both copies and ask you to choose Keep mine or Keep theirs.

## 0.2.0

- The plugin id is `obsisync` and the display name is ObsiSync.
- A second device can join by scanning a QR or by typing the invite id, pairing code, and recovery phrase.
- The hosted API is filled in for you. The computer that created the vault does not have to stay on.

## 0.1.1

- Realtime sync with no Sync button. Desktop checks about once a second. Mobile checks about every five seconds.

## 0.1.0

- First end-to-end encrypted sync between the plugin and the API.
