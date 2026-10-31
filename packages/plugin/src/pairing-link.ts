import qrcode from "qrcode-generator";

/** Query action for `obsidian://obsisync`. The other device must already have this plugin installed. */
export const PAIRING_ACTION = "obsisync";

export interface PairingPayload {
  serverUrl: string;
  inviteId: string;
  pairingCode: string;
  recoveryPhrase: string;
}

/** Link encoded in the pairing QR. It contains the recovery phrase, so it is a secret. */
export function pairingLink(payload: PairingPayload): string {
  const params = new URLSearchParams();
  params.set("server", payload.serverUrl.trim());
  params.set("invite", payload.inviteId.trim());
  params.set("code", payload.pairingCode.trim());
  params.set("phrase", payload.recoveryPhrase.trim());
  return `obsidian://${PAIRING_ACTION}?${params.toString()}`;
}

export function parsePairingLink(raw: string): PairingPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "obsidian:") {
    return null;
  }
  const action = url.hostname || url.pathname.replace(/^\//, "");
  if (action !== PAIRING_ACTION) {
    return null;
  }
  return parsePairingParams({
    server: url.searchParams.get("server") ?? "",
    invite: url.searchParams.get("invite") ?? "",
    code: url.searchParams.get("code") ?? "",
    phrase: url.searchParams.get("phrase") ?? "",
  });
}

export function parsePairingParams(params: Record<string, string | undefined>): PairingPayload | null {
  const serverUrl = params.server?.trim() ?? "";
  const inviteId = params.invite?.trim() ?? "";
  const pairingCode = params.code?.trim() ?? "";
  const recoveryPhrase = params.phrase?.trim() ?? "";
  if (!serverUrl || !inviteId || !pairingCode || !recoveryPhrase) {
    return null;
  }
  try {
    const url = new URL(serverUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }
  return { serverUrl, inviteId, pairingCode, recoveryPhrase };
}

/** SVG markup for a pairing link. The phrase is drawn as modules, not as text. */
export function pairingQrSvg(link: string): string {
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
