# Changelog

## 0.2.8

- A device that already queued deletes for several notes the server still has downloads those notes instead of deleting them everywhere.

## 0.2.7

- Catching up no longer treats a note this device already deleted as a new local edit. A later delete lines up with the copy the other device published.

## 0.2.6

- A note the server still has is downloaded even when this device already gave up on that file id.
- Publishing a replaced copy no longer lets a later delete erase the real note.

## 0.2.5

- If this device is missing most of the notes the server still has, it downloads them again instead of deleting them everywhere.
- A tombstone for a replaced copy no longer deletes the real note.

## 0.2.4

- GitHub Actions builds the release and attests `main.js` and `styles.css`.
- The readme states that sync lists every vault file outside `.obsidian`.

## 0.2.3

- The directory name is Sealed Sync. The plugin id stays `obsisync`.

## 0.2.2

- A note keeps its real name. Leftover `.vb-conflict-` copies are folded back into that note.
- When both devices edit the same note, both edits stay in the one note. Keep mine and Keep theirs choose a side.

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
