# Contributing

Issues and pull requests are welcome on [Vedant817/obsisync](https://github.com/Vedant817/obsisync).

## Checks

```bash
npm ci
npm run qa
```

`npm run qa` typechecks, runs the tests, and builds the plugin and the API. The tests use an in-memory server. Do not point them at the hosted API or a live vault.

## Do not commit

- `.env`, Turso tokens, bootstrap credentials, device tokens, or recovery phrases
- A vault's `data.json`
- Note contents or vault paths from a personal vault
- The internal specification file

Plugin releases attach `main.js`, `manifest.json`, and `styles.css` as separate files. The release tag is the manifest version with no `v` prefix. On [Vedant817/obsisync](https://github.com/Vedant817/obsisync), pushing that tag runs the release workflow, which builds `main.js` and publishes a GitHub artifact attestation for `main.js` and `styles.css`.
