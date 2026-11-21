import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += "=";
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Code Base32 invalide.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function totpCode(secret: string, timestamp = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(timestamp / 1000 / step);
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function verifyTotp(secret: string, code: string, window = 1, step = 30, digits = 6): boolean {
  const normalized = normalizeCode(code);
  if (!/^\d{6}$/.test(normalized) && normalized.length !== digits) return false;
  if (!/^\d+$/.test(normalized) || normalized.length !== digits) return false;
  for (let i = -window; i <= window; i++) {
    const t = Date.now() + i * step * 1000;
    if (timingSafeEqual(Buffer.from(totpCode(secret, t, step, digits)), Buffer.from(normalized))) return true;
  }
  return false;
}

export function totpKeyUri(secret: string, account: string, issuer = "STUDIO S"): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`;
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.push(raw.slice(0, 4) + "-" + raw.slice(4, 8));
  }
  return codes;
}

export function generateEmailCode(): string {
  // Six chiffres, sans biais modulo simple pour un code court.
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function normalizeCode(code: unknown): string {
  return String(code ?? "").replace(/\s+/g, "").trim();
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

export function verifyEmailCode(code: string, expectedHash: string): boolean {
  const given = createHash("sha256").update(normalizeCode(code)).digest();
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== given.length) return false;
  return timingSafeEqual(given, expected);
}

export function isSixDigitCode(code: unknown): boolean {
  return /^\d{6}$/.test(normalizeCode(code));
}

// Aliases pour compatibilité avec d'autres conventions de nommage.
export const generateSecret = generateTotpSecret;
export const generateTOTP = totpCode;
export const verifyToken = verifyTotp;
export const verifyTOTP = verifyTotp;
export const verifyTotpCode = verifyTotp;
export const generateOtp = generateEmailCode;
export const generateEmailOtp = generateEmailCode;
export const verifyOtp = verifyEmailCode;
export const verifyOtpCode = verifyEmailCode;
export const isValidOtp = isSixDigitCode;
