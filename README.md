# Sealed Sync

Sealed Sync keeps an Obsidian vault in sync across your computers and phones. A note open on two devices updates as you type, like a shared document, with each device's cursor shown. Each keystroke and each note is encrypted on the device before it is uploaded. Sync runs on its own. There is no Sync button.

The hosted API is `https://obsisync-api.mediclarity-voice-agent.workers.dev`, on Cloudflare Workers. A phone on mobile data uses that same address. Devices set to the earlier address move to this one on their own. The computer that created the vault does not have to stay on, and the other device does not have to be on the same Wi-Fi.

Plugin id: `obsisync`. Display name: Sealed Sync. Author: Vedant Mahajan. License: MIT.

Community page: https://community.obsidian.md/account/plugins/obsisync

An older community plugin named Vaultbridge is a different project. Install this one by the id `obsisync` or the repository `Vedant817/obsisync`.

## Why Sealed Sync

People usually pick one of four ways to sync a vault. Each one is good at something Sealed Sync does not try to replace.

| | Sealed Sync | Obsidian Sync | Self-hosted LiveSync | Remotely Save | Syncthing |
| --- | --- | --- | --- | --- | --- |
| What you pay | Plugin is free. The hosted API above is the one this project runs. | Paid. Standard is $4 per month billed annually, or $5 month to month. Plus is $8 or $10. | Plugin is free. You run CouchDB, object storage, or a peer relay. | Plugin is free. You bring Dropbox, S3, WebDAV, or similar. | Free. Devices talk to each other. |
| Encryption | On by default. AES-256-GCM on the device. The server stores ciphertext. | On by default. AES-256-GCM. Some sync metadata is not end-to-end encrypted. | On when you enable it. You operate the server. | Optional. Blank password means the bucket holds plain notes. | The files never sit on a sync vendor's server. |
| Typing on two devices at once | Merged letter by letter, live, with the other device's cursor shown. | Merged when the file syncs. No live cursors. | The file syncs in near real time. No live cursors. | Conflicts at sync time. | Conflict copies. |
| How sync starts | Automatic. Open notes update as you type. Other notes sync about once a second on desktop, about every five seconds on mobile. | Automatic, in the official app. | Near real time once the server is configured. | On a schedule, or when you run it. | Continuous, while both devices are online together. |
| A new phone | Install the plugin, then scan a QR or type three values. | Sign in to your Obsidian account. | Install the plugin, then connect it to your server. | Install the plugin, then connect your storage account. | Pair the devices on the network. There is no official iOS app. |
| Setup you avoid | No Tailscale, no copying `main.js` onto the phone, no second sync button. | No server to run. | No hosted account. | You reuse storage you already pay for. | No account and no central copy. |
| Where this one stops | A single attachment is limited to 25 MB. Version history is per note on the server, not the official history viewer. | Vault count, storage, and file size follow the plan. Standard's max file size is 5 MB. | You patch, back up, and secure the server. | Conflicts are easier to hit because sync is not continuous. | Both devices must be reachable. iOS needs a third-party app. |

Use Sealed Sync when you want encrypted realtime sync without running a database and without an Obsidian Sync subscription. Use Obsidian Sync when you want the official app, version history, and support. Use LiveSync or Remotely Save when you want the ciphertext in an account you already control. Use Syncthing when every device can see the others and you do not want a server at all.

Official Obsidian Sync can stay installed. Turn one of them off. Two sync tools will overwrite each other.

Prices and plan limits above are from Obsidian's public Sync page and from community write-ups checked in 2026. Recheck [obsidian.md/sync](https://obsidian.md/sync) before you compare a bill.

## Live editing

Open the same note on two devices and type on either one. The other device shows the edit within about a second, without reloading the note and without moving your cursor. Edits made on both devices at the same moment are merged letter by letter. Neither one replaces the other.

- **Cursors.** Each device's cursor and selection appear in the other device's editor, in a colour per device, labelled with the device name. Set the name under **Live editing** in settings. The status bar shows how many other devices are editing.
- **Encrypted.** Each change and each cursor position is sealed with AES-256-GCM on the device, under a key derived from the vault key. The server keeps an ordered log of sealed changes per note, and an id it cannot turn back into a note name.
- **Offline.** Edits made while offline are sent when the device reconnects and merge with whatever changed in the meantime. A note changed while it was closed, for example by another app or a template, is folded into the live note the next time it opens.
- **Scope.** Markdown and text notes under 1 MB are edited live. Attachments, canvases, and notes that are not open sync as whole files, as before.

Turn live editing off under **Live editing** in settings to sync open notes as whole files only.

## Network

Sealed Sync sends ciphertext and sync metadata to `https://obsisync-api.mediclarity-voice-agent.workers.dev`. That server stores them in Turso. While Obsidian is open, the plugin keeps one WebSocket open to that server. Live edits, cursors, and a short "another device saved a file" notice arrive over it. If the WebSocket cannot connect, the plugin falls back to polling over HTTPS. File names travel inside the encrypted manifest. The vault key stays on your devices. A recovery phrase unwraps it.

The hosted service is required for devices to see each other's changes, unless you point the plugin at your own server. The plugin does not sell a subscription and it does not add an account login. The pairing QR contains the recovery phrase, so keep that screen private.

## Vault access

Sealed Sync calls `vault.getFiles()` on each sync cycle. That lists every file path in the vault except the `.obsidian` folder. Sync needs the list to notice a note added, edited, or deleted on this device. File names stay inside the encrypted manifest. The plugin does not upload a separate directory of paths.

## Install

Until the community directory lists this plugin, install it with BRAT:

1. Settings → Community plugins. Turn Restricted mode off.
2. Browse, search for **BRAT**, install it, and enable it.
3. Open BRAT settings and choose **Add beta plugin**.
4. Enter `Vedant817/obsisync`.
5. Enable **Sealed Sync**.
6. Open Sealed Sync settings. The server address is already filled in.

After the directory listing is approved, search for **Sealed Sync** and install it from Community plugins. Reload Obsidian after you change the API address.

## Add another device

Install Sealed Sync on the other device first. On the device that already has the notes, open Sealed Sync settings and click **Create a pairing code**. The code works once and expires in ten minutes.

Connect the other device in either way:

- **Scan.** Leave the QR on the screen. Open the camera on the other device and point it at the code. Obsidian opens and joins.
- **Type the codes.** Copy the invite id, the pairing code, and the recovery phrase. On the other device, enter them under **Or type the codes** and click **Join vault**. If the camera copies the link instead of opening Obsidian, paste it into **Pairing link** and click **Join from link**.

A new note on either device shows up on the other while both are open. The status bar reads `Sealed Sync live`.

Closing Obsidian does not disconnect a device that has already joined. The login is stored in the vault at `.obsidian/plugins/obsisync/data.json`. Opening Obsidian again resumes sync. The pairing code is not used again. A device stays on the vault until you click **Revoke**.

Clearing Obsidian's cache does not remove that file. Deleting the `obsisync` plugin folder, or `data.json` inside it, removes the login from that device only. The other device stays connected. Sign the device back in with the recovery phrase, then pair it again from a device that is still signed in.

A wrong recovery phrase uses up that pairing code and adds a device that never saved its token. Create another code, then revoke the extra device from **Refresh vault info**.

If the same note is open on both devices, edits merge live as you type. If it was edited on both devices while it was closed on one of them, the edit made in that note's editor is folded into the live note when it opens. Otherwise the later edit replaces the note. The file name does not change, and an identical note is not saved a second time.

**Pause sync** holds uploads and downloads until you turn it off. Leave it off for normal use.

## Limits

A single attachment can be up to 25 MB. Notes over 1 MB, and files that are not Markdown or text, sync as whole files instead of live.

## Repository

This repository is the plugin and the sync API.

| Path | What it is |
| --- | --- |
| `packages/plugin` | Obsidian plugin. `manifest.json` is the listing manifest. |
| `packages/crypto` | AES-256-GCM, HKDF, and the recovery phrase. |
| `packages/protocol` | Request and response shapes shared by the plugin and the API. |
| `packages/sync-core` | Scan, reconcile, push, and conflict handling. |
| `packages/live-core` | Live editing: the CRDT document, sealing, and the poll loop. |
| `apps/worker` | Node API. Journal and ciphertext are both in Turso. |
| `apps/worker/wrangler.toml` | Cloudflare Worker and the live-room Durable Object. Pushing to `main` deploys it. |
| `public` | Small page for the hosted API. Health is `/v1/health`. |
| `tests` | Two-device tests against an in-memory server. |
| `versions.json` | Plugin version to minimum Obsidian version. |
| `Dockerfile` | Optional self-hosted API. |
| `CHANGELOG.md` | User-visible plugin changes. |
| `SECURITY.md` | How to report a vulnerability, and what to keep off GitHub. |
| `CONTRIBUTING.md` | How to run the checks before a pull request. |

```bash
npm ci
npm run qa
npm run build:plugin
npm run build:worker
```

`npm run qa` typechecks, runs the tests, and builds. The plugin build writes `packages/plugin/main.js`. That file is gitignored here. A GitHub release of the plugin carries `main.js`, `manifest.json`, and `styles.css` as separate files.

The hosted API deploys from `.github/workflows/deploy-api.yml` on every push to `main` that changes it. The workflow needs the `CLOUDFLARE_API_TOKEN` repository secret. The Worker needs `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as Worker secrets.

To self-host the API, build the `Dockerfile` and set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `HOST=0.0.0.0`, and `PORT`. Put that server's HTTPS address in the plugin. Reload Obsidian after the change. The Node server has no WebSocket room, so live editing there runs over HTTPS polling.

Pairing QR codes use [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).

## Publish to the community directory

Obsidian no longer accepts a pull request that edits `community-plugins.json`. The directory reads a release from GitHub, then you submit the repo on the website.

1. The default branch has `manifest.json` at the root of the plugin repository, plus `versions.json`, `README.md`, and `LICENSE`.
2. `manifest.json` `version` is `x.y.z`. The id is `obsisync`. The description matches the directory listing, is under 250 characters, and ends with a period.
3. Push a tag on [Vedant817/obsisync](https://github.com/Vedant817/obsisync) whose name is that version, with no `v` prefix. The release workflow builds `main.js`, attests `main.js` and `styles.css`, and publishes the release.
4. The release files are `main.js`, `manifest.json`, and `styles.css`, each as its own asset.
5. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account and link GitHub.
6. Open **Plugins**, choose **New plugin**, and enter `https://github.com/Vedant817/obsisync`.
7. Agree to the developer policies and submit.

The community page for this plugin is https://community.obsidian.md/account/plugins/obsisync

Verify a downloaded release file:

```bash
gh attestation verify main.js --repo Vedant817/obsisync
gh attestation verify styles.css --repo Vedant817/obsisync
```

The display name is Sealed Sync. Names that start with "Obsi" are rejected. The plugin id stays `obsisync` and cannot contain `obsidian`.

This repository is the plugin and the API. Obsidian installs the release from [Vedant817/obsisync](https://github.com/Vedant817/obsisync).
