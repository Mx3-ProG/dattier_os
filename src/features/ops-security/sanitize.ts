/** Removes secrets and personal payment data before anything reaches the journal. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session[-_]?token|signature|card|iban|cvc|cvv|pan\b|otp|hash/i;
const SENSITIVE_VALUE: [RegExp, string][] = [
  [/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9]{6,}/g, "[CLÉ API MASQUÉE]"],
  [/\bwhsec_[A-Za-z0-9]{6,}/g, "[SECRET WEBHOOK MASQUÉ]"],
  [/\bre_[A-Za-z0-9_]{12,}/g, "[CLÉ API MASQUÉE]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [JETON MASQUÉ]"],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
    "[JWT MASQUÉ]",
  ],
  [/\b[a-f0-9]{48,}\b/gi, "[JETON MASQUÉ]"],
  // 13–19 digit sequences (optionally spaced) look like payment card numbers.
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[NUMÉRO MASQUÉ]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[E-MAIL MASQUÉ]"],
];
export function scrubText(value: string, max = 2000) {
  let out = value;
  for (const [pattern, replacement] of SENSITIVE_VALUE)
    out = out.replace(pattern, replacement);
  return out.length > max ? `${out.slice(0, max)}… [tronqué]` : out;
}
export function sanitize(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string") return scrubText(value);
  if (depth > 4) return "[profondeur maximale]";
  if (value instanceof Error)
    return sanitize(
      {
        name: value.name,
        message: value.message,
        code: (value as { code?: unknown }).code,
        stack: value.stack?.split("\n").slice(0, 6).join("\n"),
      },
      depth + 1,
    );
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value).slice(0, 60))
      out[key] = SENSITIVE_KEY.test(key) ? "[MASQUÉ]" : sanitize(v, depth + 1);
    return out;
  }
  return String(value);
}
