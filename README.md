# Sealed Sync

Sealed Sync keeps an Obsidian vault in sync across your computers and phones. Each note is encrypted on the device before it is uploaded. Sync runs on its own. There is no Sync button.

The hosted API is `https://vaultbridge-three.vercel.app`. A phone on mobile data uses that same address. The computer that created the vault does not have to stay on, and the other device does not have to be on the same Wi-Fi.

Plugin id: `obsisync`. Author: Vedant Mahajan. License: MIT.

An older community plugin named Vaultbridge is a different project. Install this one by the id `obsisync` or the repository `Vedant817/obsisync`.

## Why Sealed Sync

People usually pick one of four ways to sync a vault. Each one is good at something Sealed Sync does not try to replace.

| | Sealed Sync | Obsidian Sync | Self-hosted LiveSync | Remotely Save | Syncthing |
| --- | --- | --- | --- | --- | --- |
| What you pay | Plugin is free. The hosted API above is the one this project runs. | Paid. Standard is $4 per month billed annually, or $5 month to month. Plus is $8 or $10. | Plugin is free. You run CouchDB, object storage, or a peer relay. | Plugin is free. You bring Dropbox, S3, WebDAV, or similar. | Free. Devices talk to each other. |
| Encryption | On by default. AES-256-GCM on the device. The server stores ciphertext. | On by default. AES-256-GCM. Some sync metadata is not end-to-end encrypted. | On when you enable it. You operate the server. | Optional. Blank password means the bucket holds plain notes. | The files never sit on a sync vendor's server. |
| How sync starts | Automatic. About once a second on desktop, about every five seconds on mobile. | Automatic, in the official app. | Near real time once the server is configured. | On a schedule, or when you run it. | Continuous, while both devices are online together. |
| A new phone | Install the plugin, then scan a QR or type three values. | Sign in to your Obsidian account. | Install the plugin, then connect it to your server. | Install the plugin, then connect your storage account. | Pair the devices on the network. There is no official iOS app. |
| Setup you avoid | No Tailscale, no copying `main.js` onto the phone, no second sync button. | No server to run. | No hosted account. | You reuse storage you already pay for. | No account and no central copy. |
| Where this one stops | One request can be about 4.5 MB on the current host. A normal note fits. A large attachment can fail. Version history is per note on the server, not the official history viewer. | Vault count, storage, and file size follow the plan. Standard's max file size is 5 MB. | You patch, back up, and secure the server. | Conflicts are easier to hit because sync is not continuous. | Both devices must be reachable. iOS needs a third-party app. |

Use Sealed Sync when you want encrypted realtime sync without running a database and without an Obsidian Sync subscription. Use Obsidian Sync when you want the official app, version history, and support. Use LiveSync or Remotely Save when you want the ciphertext in an account you already control. Use Syncthing when every device can see the others and you do not want a server at all.

Official Obsidian Sync can stay installed. Turn one of them off. Two sync tools will overwrite each other.

Prices and plan limits above are from Obsidian's public Sync page and from community write-ups checked in 2026. Recheck [obsidian.md/sync](https://obsidian.md/sync) before you compare a bill.

## Network

Sealed Sync sends ciphertext and sync metadata to `https://vaultbridge-three.vercel.app`. That server stores them in Turso. File names travel inside the encrypted manifest. The vault key stays on your devices. A recovery phrase unwraps it.

The hosted service is required for devices to see each other's changes, unless you point the plugin at your own server. The plugin does not sell a subscription and it does not add an account login. The pairing QR contains the recovery phrase, so keep that screen private.

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

Clearing Obsidian's cache does not remove that file. Deleting the Sealed Sync plugin folder, or `data.json` inside it, removes the login from that device only. The other device stays connected. Sign the device back in with the recovery phrase, then pair it again from a device that is still signed in.

A wrong recovery phrase uses up that pairing code and adds a device that never saved its token. Create another code, then revoke the extra device from **Refresh vault info**.

If the same note was edited on both devices, both edits stay in that one note. Obsidian asks you to choose **Keep mine** or **Keep theirs**. The file name does not change, and an identical note is not saved a second time.

**Pause sync** holds uploads and downloads until you turn it off. Leave it off for normal use.

## Limits

One request can be about 4.5 MB. A normal note fits. A very large attachment can fail until the API moves to a host with a higher body limit.

## Repository

Obsidian installs the three files at the root of this repository.

| Path | What it is |
| --- | --- |
| `main.js`, `manifest.json`, `styles.css` | The plugin Obsidian loads. |
| `versions.json` | Plugin version to minimum Obsidian version. |
| `packages/` | Source for encryption, the sync client, and the settings screen. |
| `CHANGELOG.md` | User-visible changes. |
| `SECURITY.md` | How to report a vulnerability. |
| `CONTRIBUTING.md` | How to propose a change. |
| `LICENSE` | MIT. |

Pairing QR codes use [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).

## Publish to the community directory

Obsidian no longer accepts a pull request that edits `community-plugins.json`. The directory reads a release from GitHub, then you submit the repo on the website.

1. The default branch has `manifest.json` at the repository root, plus `versions.json`, `README.md`, and `LICENSE`.
2. `manifest.json` `version` is `x.y.z`. The id is `obsisync`. The description matches the directory listing, is under 250 characters, and ends with a period.
3. Create a GitHub release whose tag and name are that version, with no `v` prefix.
4. Attach `main.js`, `manifest.json`, and `styles.css` as separate release files.
5. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account and link GitHub.
6. Open **Plugins**, choose **New plugin**, and enter `https://github.com/Vedant817/obsisync`.
7. Agree to the developer policies and submit.

The display name is Sealed Sync. Names that start with "Obsi" are rejected. The plugin id stays `obsisync` and cannot contain `obsidian`.


