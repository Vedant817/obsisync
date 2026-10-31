# ObsiSync

End-to-end encrypted sync for an Obsidian vault. Notes are encrypted on the device before they leave it. The sync API is hosted at `https://vaultbridge-three.vercel.app`. The journal and ciphertext live in Turso. Your computer does not have to stay on, and the other device does not have to be on the same Wi-Fi.

Sync runs on its own. There is no Sync button.

Official Obsidian Sync can stay installed. Turn one of them off. Two sync tools will overwrite each other.

## Network

ObsiSync sends ciphertext and sync metadata to `https://vaultbridge-three.vercel.app`. That server stores them in Turso. The vault key stays on your devices. A recovery phrase unwraps it. The hosted service is required for devices to see each other's changes.

## Install

Until ObsiSync is listed in the community plugin directory, install it with BRAT:

1. Settings → Community plugins. Turn Restricted mode off.
2. Browse, search for **BRAT**, install it, and enable it.
3. Open BRAT settings and choose **Add beta plugin**.
4. Enter `Vedant817/obsisync`.
5. Enable **ObsiSync** in Community plugins.
6. Open ObsiSync settings. The server address is already `https://vaultbridge-three.vercel.app`.

After the directory listing is approved, search for **ObsiSync** under Community plugins and install it there. The id is `obsisync`. An older plugin named Vaultbridge is a different project.

## Add another device

Install ObsiSync on the other device first. Then, on the device that already has the notes:

1. Reload Obsidian so it picks up this version.
2. Settings → Community plugins → ObsiSync.
3. Click **Create a pairing code**. It works once and expires in ten minutes.

You can connect the other device in either way:

- **Scan.** Leave the QR on the screen. On the other device, open the camera and point it at the code. Obsidian opens and joins. The QR contains the recovery phrase, so keep that screen private.
- **Type the codes.** Copy the invite id, the pairing code, and the recovery phrase. On the other device, enter them under **Or type the codes** and click **Join vault**. If the camera copies the link instead of opening Obsidian, paste that link into **Pairing link** and click **Join from link**.

Create a note on either device. It shows up on the other without a sync button. The status bar reads `ObsiSync live`.

A wrong recovery phrase uses up that pairing code and adds a device that never saved its token. Create another code, then revoke the extra device from **Refresh vault info**.

## Limits

One request can be about 4.5 MB. A normal note fits. A very large attachment can fail until the API moves to a host with a higher body limit.

## Source

Readable source for the plugin, encryption, protocol, and sync engine is in `packages/`. `main.js` is the built plugin. Pairing QR codes use [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).
