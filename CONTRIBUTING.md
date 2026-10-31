# Contributing

Issues and pull requests are welcome.

Please do not include a recovery phrase, a pairing code, a device token, or the text of a note.

A plugin release attaches `main.js`, `manifest.json`, and `styles.css` as separate files. The release tag is the manifest version with no `v` prefix. Pushing that tag runs `.github/workflows/release.yml`, which builds `main.js` and publishes a GitHub artifact attestation for `main.js` and `styles.css`. `versions.json` lists each published version and the minimum Obsidian version for it.
