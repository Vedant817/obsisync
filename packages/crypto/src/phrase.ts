/**
 * Printable recovery phrase from a 32-byte key.
 *
 * Encoding: Bech32 (BIP-173 constants) with human-readable prefix `vbrk`.
 * - Every 32-byte key maps to exactly one phrase ("...-").
 * - The built-in 6-character checksum catches typos and single-character
 *   slips before an unlock attempt hits the wrong key (fail-closed).
 * - This is an encoding, not cryptography_case — the entropy stays 256 bits.
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHARVALUE = new Map<string, number>();
for (let i = 0; i < CHARSET.length; i++) {
  CHARVALUE.set(CHARSET[i]!, i);
}

const HRP = "vbrk";
const GROUP_SIZE = 6;

// BIP-173 generator / range constants (public domain).
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; ++i) {
      if ((top >> i) & 1) {
        chk ^= GEN[i]!;
      }
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    out.push(hrp.charCodeAt(i) >> 5);
  }
  out.push(0);
  for (let i = 0; i < hrp.length; i++) {
    out.push(hrp.charCodeAt(i) & 31);
  }
  return out;
}

/** Convert byte array between bit-widths (e.g. 8 -> 5). */
function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  const maxAcc = (1 << (fromBits + toBits - 1)) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits > 0) {
      return null;
    }
    acc = ((acc << fromBits) | value) & maxAcc;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }
  return ret;
}

export function keyToPhrase(key: Uint8Array): string {
  if (key.length !== 32) {
    throw new Error("recovery key must be exactly 32 bytes");
  }
  const data = convertBits(Array.from(key), 8, 5, true)!;
  const checksum = encodeChecksum(data);
  const chars = [...data, ...checksum].map((v) => CHARSET[v]!);
  const raw = `${HRP}1${chars.join("")}`;
  return groupPhrase(raw);
}

export async function phraseToKey(phrase: string): Promise<Uint8Array> {
  const lowered = phrase.trim().toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  const [hrp, dataPart] = lowered.split("1");
  if (hrp !== HRP || !dataPart) {
    throw new Error("recovery phrase prefix is wrong — check copying");
  }
  const charValues: number[] = [];
  for (const c of dataPart) {
    const v = CHARVALUE.get(c);
    if (v === undefined) {
      throw new Error(`recovery phrase contains invalid character "${c}"`);
    }
    charValues.push(v);
  }
  const data = charValues.slice(0, -6);
  const checksum = charValues.slice(-6);
  if (data.length + 6 !== charValues.length || polymod([...hrpExpand(HRP), ...charValues]) !== 1) {
    throw new Error("recovery phrase checksum failed — a character is off");
  }
  const bytes = convertBits(data, 5, 8, false);
  if (!bytes || bytes.length !== 32) {
    throw new Error("recovery phrase decodes to wrong key length");
  }
  return Uint8Array.from(bytes);
}

function encodeChecksum(data: number[]): number[] {
  const polym = polymod([...hrpExpand(HRP), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const out: number[] = [];
  for (let i = 0; i < 6; ++i) {
    out.push((polym >> 5 * (5 - i)) & 31);
  }
  return out;
}

/** Insert dashes every GROUP_SIZE chars once the prefix is consumed. */
function groupPhrase(raw: string): string {
  const [prefix, body] = splitPrefix(raw);
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP_SIZE) {
    groups.push(body.slice(i, i + GROUP_SIZE));
  }
  const afterFirst = groups.length > 0 ? `${prefix}1${groups[0]}` : prefix;
  return [afterFirst, ...groups.slice(1)].join("-");
}

function splitPrefix(raw: string): [string, string] {
  const idx = raw.indexOf("1");
  return [raw.slice(0, idx), raw.slice(idx + 1)];
}
