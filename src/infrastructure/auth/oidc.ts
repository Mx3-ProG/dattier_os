import { randomBytes, createHash } from "node:crypto";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { cookies } from "next/headers";
import { getDb } from "../database/db";
import { withDatabaseContext } from "../database/context";
import { isSuperAdminEmail } from "./superadmin";
import type { Role } from "@/core/permissions";
const cookieName = "atacuisine_identity";
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("SESSION_SECRET doit contenir au moins 32 caractères.");
  return new TextEncoder().encode(s);
}
export function appOrigin() {
  return new URL(process.env.APP_URL || "http://localhost:3000").origin;
}
function backchannel(url: string) {
  if (!process.env.OIDC_BACKCHANNEL_ORIGIN) return url;
  const original = new URL(url),
    issuer = new URL(process.env.OIDC_ISSUER!);
  if (original.origin !== issuer.origin)
    throw new Error("Endpoint identité incompatible.");
  const target = new URL(process.env.OIDC_BACKCHANNEL_ORIGIN);
  original.protocol = target.protocol;
  original.host = target.host;
  return original.toString();
}
async function metadata() {
  const issuer = process.env.OIDC_ISSUER;
  if (!issuer) throw new Error("Identité non configurée.");
  const u = new URL(issuer);
  if (u.protocol !== "https:" && process.env.OIDC_ALLOW_HTTP !== "true")
    throw new Error("OIDC exige HTTPS.");
  const response = await fetch(
    backchannel(`${issuer}/.well-known/openid-configuration`),
    { cache: "no-store", signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("Service identité indisponible.");
  const m = await response.json();
  if (m.issuer !== issuer) throw new Error("Émetteur OIDC incompatible.");
  return m as {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    end_session_endpoint?: string;
  };
}
async function signed(payload: Record<string, unknown>, expires: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atacuisine")
    .setAudience("atacuisine-web")
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());
}
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: appOrigin().startsWith("https:"),
  path: "/",
};
export function safeReturnTo(value = "/platform") {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/platform";
  const origin = appOrigin();
  const target = new URL(value, origin);
  return target.origin === origin ? value : "/platform";
}
export async function beginLogin(returnTo = "/platform", register = false) {
  const m = await metadata(),
    state = randomBytes(32).toString("hex"),
    nonce = randomBytes(32).toString("hex"),
    verifier = randomBytes(48).toString("base64url");
  const safeReturn = safeReturnTo(returnTo);
  (await cookies()).set(
    "atacuisine_oidc",
    await signed({ state, nonce, verifier, returnTo: safeReturn }, "10m"),
    { ...cookieOptions, maxAge: 600 },
  );
  const url = new URL(m.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: process.env.OIDC_CLIENT_ID || "atacuisine",
    redirect_uri: `${appOrigin()}/auth/callback`,
    response_type: "code",
    prompt: register ? "create" : "login",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url;
}
export async function finishLogin(code: string, state: string) {
  const jar = await cookies(),
    flow = jar.get("atacuisine_oidc")?.value;
  if (!flow) throw new Error("Connexion expirée.");
  const { payload } = await jwtVerify(flow, secret(), {
    issuer: "atacuisine",
    audience: "atacuisine-web",
    algorithms: ["HS256"],
  });
  jar.delete("atacuisine_oidc");
  if (payload.state !== state || typeof payload.verifier !== "string")
    throw new Error("État de connexion invalide.");
  const m = await metadata();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.OIDC_CLIENT_ID || "atacuisine",
    redirect_uri: `${appOrigin()}/auth/callback`,
    code_verifier: payload.verifier,
  });
  if (process.env.OIDC_CLIENT_SECRET)
    params.set("client_secret", process.env.OIDC_CLIENT_SECRET);
  const response = await fetch(backchannel(m.token_endpoint), {
    method: "POST",
    body: params,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Connexion refusée.");
  const tokens = await response.json();
  const identity = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(backchannel(m.jwks_uri))),
    {
      issuer: m.issuer,
      audience: process.env.OIDC_CLIENT_ID || "atacuisine",
      algorithms: ["RS256", "PS256", "ES256"],
    },
  );
  if (
    identity.payload.nonce !== payload.nonce ||
    !identity.payload.sub ||
    identity.payload.email_verified !== true
  )
    throw new Error("Identité ou e-mail non vérifié.");
  await establishIdentity(
    m.issuer,
    String(identity.payload.sub),
    String(
      identity.payload.name ||
        identity.payload.preferred_username ||
        "Utilisateur",
    ),
    String(identity.payload.email || ""),
  );
  return String(payload.returnTo || "/platform");
}
/** Opens the signed app session for a verified identity (OIDC or Supabase). */
export async function establishIdentity(
  issuer: string,
  sub: string,
  rawName: string,
  rawEmail: string,
) {
  const id =
    "oidc:" + createHash("sha256").update(`${issuer}\0${sub}`).digest("hex");
  const name = rawName.slice(0, 100) || "Utilisateur",
    email = rawEmail.toLowerCase().slice(0, 150);
  const isSuper = isSuperAdminEmail(email);
  await withDatabaseContext({ userId: id }, async () => {
    const db = await getDb();
    await db.query("SELECT app.ensure_profile($1,$2,$3)", [id, name, email]);
    if (isSuper) {
      await db.query(
        "UPDATE profiles SET role='SUPER_ADMIN', status='active' WHERE id=$1",
        [id],
      );
      await db.query(
        "INSERT INTO platform_admins(profile_id) VALUES($1) ON CONFLICT DO NOTHING",
        [id],
      );
    }
  });
  const role: Role = isSuper ? "SUPER_ADMIN" : "WAITER";
  (await cookies()).set(
    cookieName,
    await signed(
      { sub: id, name, email, role, issuedAtMs: Date.now() },
      "12h",
    ),
    { ...cookieOptions, maxAge: 43200 },
  );
  return id;
}
export function oidcConfigured() {
  return !!process.env.OIDC_ISSUER;
}
export async function oidcActor() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) throw new Error("Connexion requise.");
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "atacuisine",
      audience: "atacuisine-web",
      algorithms: ["HS256"],
    });
    if (!payload.sub) throw new Error();
    const isSuper = isSuperAdminEmail(String(payload.email));
    const role: Role = isSuper
      ? "SUPER_ADMIN"
      : ((payload.role as Role) || "WAITER");
    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      authIssuedAt: Number(payload.issuedAtMs || Number(payload.iat) * 1000),
      role,
      roles: isSuper ? (["SUPER_ADMIN", "OWNER"] as Role[]) : [role],
    };
  } catch {
    throw new Error("Connexion expirée.");
  }
}
export async function logout() {
  const jar = await cookies();
  jar.delete(cookieName);
  jar.delete("atacuisine_session");
  jar.delete("atacuisine_oidc");
}
