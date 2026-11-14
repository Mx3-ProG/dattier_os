export const PRIMARY_SUPER_ADMIN_EMAIL = "mat75.deff@gmail.com";

export const DEFAULT_SUPER_ADMIN_EMAILS: readonly string[] = [
  "mat75.deff@gmail.com",
  "mat75.def@gmail.com",
];

/**
 * Returns true if the email is designated as a platform Super Admin.
 * Checks the built-in list as well as the SUPER_ADMIN_EMAILS env variable.
 */
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (DEFAULT_SUPER_ADMIN_EMAILS.includes(normalized)) return true;
  const envList = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return envList.includes(normalized);
}
