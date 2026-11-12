/**
 * Supabase Auth as the hosted identity provider (Vercel production).
 *
 * The browser talks to Supabase Auth directly (sign-in, sign-up, password
 * recovery), so Supabase applies its rate limits per real visitor. The server
 * never trusts the browser: it re-reads the user from Supabase with the access
 * token, requires a confirmed e-mail, then opens the usual signed app session.
 */
const trimSlash = (value: string) => value.replace(/\/+$/, "");

export function supabaseUrl() {
  const raw =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!raw) return "";
  const url = new URL(raw);
  if (url.protocol !== "https:" && process.env.OIDC_ALLOW_HTTP !== "true")
    throw new Error("Supabase exige HTTPS.");
  return trimSlash(url.origin);
}

export function supabasePublishableKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

export function supabaseConfigured() {
  try {
    return !!supabaseUrl() && !!supabasePublishableKey();
  } catch {
    return false;
  }
}

/** Values the browser needs; the publishable key is public by design. */
export function supabasePublicConfig() {
  return supabaseConfigured()
    ? { url: supabaseUrl(), key: supabasePublishableKey() }
    : null;
}

export const supabaseIssuer = () => `${supabaseUrl()}/auth/v1`;

type SupabaseUser = {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

/** Authoritative check of an access token against Supabase Auth. */
export async function supabaseUser(accessToken: string) {
  if (!supabaseConfigured()) throw new Error("Identité non configurée.");
  if (!/^[A-Za-z0-9._-]{20,4096}$/.test(accessToken))
    throw new Error("Connexion refusée.");
  const response = await fetch(`${supabaseIssuer()}/user`, {
    headers: {
      apikey: supabasePublishableKey(),
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("Connexion refusée.");
  if (!response.ok) throw new Error("Service identité indisponible.");
  const user = (await response.json()) as SupabaseUser;
  if (!user.id || !user.email) throw new Error("Connexion refusée.");
  if (!user.email_confirmed_at)
    throw new Error("Confirmez votre adresse e-mail avant de vous connecter.");
  const meta = user.user_metadata ?? {};
  const name = String(
    meta.name || meta.full_name || user.email.split("@")[0] || "Utilisateur",
  );
  return { sub: user.id, email: user.email, name };
}
