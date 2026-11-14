/**
 * Password rules shared by the browser (live checklist) and the server
 * (authoritative check before any account is created or a password changed).
 *
 * 72 is the bcrypt limit used by Supabase Auth: longer passwords would be
 * silently truncated, so they are refused instead.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordRule = { id: string; label: string; ok: boolean };

const COMMON = [
  "password", "motdepasse", "azerty", "qwerty", "123456", "abcdef",
  "admin", "welcome", "bienvenue", "soleil", "iloveyou", "studioos",
  "restaurant", "letmein", "000000", "111111",
];

/** Each rule with its state, in display order. */
export function passwordRules(password: string, email = ""): PasswordRule[] {
  const lower = password.toLowerCase();
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return [
    { id: "length", label: `${PASSWORD_MIN_LENGTH} caractères minimum`, ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH },
    { id: "lower", label: "Une lettre minuscule", ok: /\p{Ll}/u.test(password) },
    { id: "upper", label: "Une lettre majuscule", ok: /\p{Lu}/u.test(password) },
    { id: "digit", label: "Un chiffre", ok: /\d/.test(password) },
    { id: "special", label: "Un caractère spécial (! ? @ # $ % …)", ok: /[^\p{L}\d\s]/u.test(password) },
    {
      id: "guessable",
      label: "Pas de mot de passe courant ni votre e-mail",
      ok:
        password.length > 0 &&
        !/\s/.test(password) &&
        !/(.)\1{3,}/.test(password) &&
        !COMMON.some((word) => lower.includes(word)) &&
        !(local.length >= 4 && lower.includes(local)),
    },
  ];
}

/** French error for the first unmet rule, or null when the password is acceptable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Mot de passe trop long : ${PASSWORD_MAX_LENGTH} caractères maximum.`;
  if (/\s/.test(password)) return "Le mot de passe ne doit pas contenir d’espace.";
  const missing = passwordRules(password, email).filter((rule) => !rule.ok);
  if (!missing.length) return null;
  return `Mot de passe trop faible : ${missing.map((rule) => rule.label.toLowerCase()).join(", ")}.`;
}
