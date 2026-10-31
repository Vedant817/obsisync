# VaultBridge

End-to-end encrypted sync for an Obsidian vault. Notes are encrypted on the device before they leave it. The sync API is hosted at `https://vaultbridge-three.vercel.app`. The journal and ciphertext live in Turso. Your computer does not have to stay on, and the other device does not have to be on the same Wi-Fi.

Sync runs on its own. There is no Sync button.

Official Obsidian Sync can stay installed. Turn one of them off. Two sync tools will overwrite each other.

## Install on a phone or another computer

VaultBridge is not in the Obsidian directory yet. Install it from the directory listing for BRAT, which downloads the plugin for you. You do not copy files across devices.

1. Settings → Community plugins. Turn Restricted mode off.
2. Browse, search for **BRAT**, install it, and enable it.
3. Open BRAT settings and choose **Add beta plugin**.
4. Enter `Vedant817/vaultbridge`.
5. Enable **VaultBridge** in Community plugins.
6. Open VaultBridge settings. The server address is already `https://vaultbridge-three.vercel.app`.

## Add the phone to a vault that already syncs

On the device that already has the notes:

1. Reload Obsidian so it picks up the hosted server.
2. Settings → Community plugins → VaultBridge.
3. Copy the recovery phrase.
4. Click **Create a pairing code**. It works once and expires in ten minutes.

On the phone, in VaultBridge settings, enter the invite id, the pairing code, and the recovery phrase, then click **Join vault**. Create a note on either device. It shows up on the other without a sync button.

A wrong recovery phrase uses up that pairing code and adds a device that never saved its token. Create another code, then revoke the extra device from **Refresh vault info**.

## Limits

One request can be about 4.5 MB. A normal note fits. A very large attachment can fail until the API moves to a host with a higher body limit.

## Self-host

`Dockerfile` builds the same API. Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `HOST=0.0.0.0`, and `PORT`. The plugin then needs that server's HTTPS address instead of the hosted one.

## Source
The plugin source is in `packages/plugin/src`. Encryption and sync code are in `packages/crypto`, `packages/protocol`, and `packages/sync-core`. `main.js` is the build Obsidian loads.

