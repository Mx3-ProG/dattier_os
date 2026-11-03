import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
function key() {
  const hex = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!hex || !/^([a-f0-9]{64})$/i.test(hex))
    throw new Error("Clé de chiffrement des connecteurs non configurée.");
  return Buffer.from(hex, "hex");
}
export function encryptSecret(
  restaurant: string,
  provider: string,
  secret: unknown,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${restaurant}\0${provider}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(secret), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptSecret(
  restaurant: string,
  provider: string,
  value: string,
) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1") throw new Error("Version de secret inconnue.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(`${restaurant}\0${provider}`));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(body, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
export function verifyEnvelope(
  secret: string,
  raw: string,
  timestamp: string,
  signature: string,
  now = Date.now(),
) {
  const seconds = Number(timestamp);
  if (
    !Number.isFinite(seconds) ||
    Math.abs(now / 1000 - seconds) > 300 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new Error("Signature ou horodatage refusé.");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new Error("Signature refusée.");
}
export const providers = [
  {
    kind: "payment",
    provider: "stripe",
    state: "requires_merchant_onboarding",
  },
  {
    kind: "cash_register",
    provider: "partner_selection",
    state: "requires_validated_cash_register",
  },
  {
    kind: "accounting",
    provider: "pennylane",
    state: "requires_partner_access",
  },
  { kind: "payroll", provider: "payfit", state: "requires_partner_access" },
  { kind: "delivery", provider: "uber_eats", state: "requires_partner_access" },
] as const;
