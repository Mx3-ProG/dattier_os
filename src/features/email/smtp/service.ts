import { rows, type DB } from "@/lib/database/db";
import { encryptSecret } from "@/features/integrations/security";
import { defaultTransport, transportSchema, type TransportView } from "./config";
import { resolvePublicHost } from "./guard";
import { platformSmtp, SMTP_SECRET_PROVIDER } from "./transports";
import { productionEnabled } from "@/lib/database/db";

/** Lecture de la configuration SMTP, sans jamais exposer le mot de passe. */
export async function readTransport(db: DB, restaurant: string): Promise<TransportView> {
  const [row] = await rows<{
    mode: "platform" | "custom";
    host: string | null;
    port: number | null;
    security: "tls" | "starttls" | null;
    username: string | null;
    from_email: string | null;
    from_name: string | null;
    has_password: boolean;
    verified_at: string | null;
    last_error: string | null;
  }>(
    db,
    // has_password passe par une fonction : la colonne du secret n'est pas lisible par l'application.
    `SELECT mode,host,port,security,username,from_email,from_name,verified_at,last_error,
       (app.email_delivery_context($1)->'transport'->>'secret') IS NOT NULL AS has_password
     FROM email_transports WHERE restaurant_id=$1`,
    [restaurant],
  );
  if (!row) return defaultTransport;
  return {
    mode: row.mode,
    host: row.host,
    port: row.port,
    security: row.security,
    username: row.username,
    fromEmail: row.from_email,
    fromName: row.from_name,
    hasPassword: row.has_password,
    verifiedAt: row.verified_at,
    lastError: row.last_error,
  };
}

/** État du SMTP partagé de la plateforme, pour l'écran (aucun identifiant exposé). */
export function platformStatus() {
  const target = platformSmtp();
  return {
    configured: !!target && productionEnabled(),
    sender: target?.from ?? null,
  };
}

export async function saveTransport(db: DB, restaurant: string, userId: string, raw: unknown) {
  const input = transportSchema.parse(raw);
  if (input.mode === "platform") {
    await db.query(
      `INSERT INTO email_transports(restaurant_id,mode,updated_by) VALUES($1,'platform',$2)
       ON CONFLICT(restaurant_id) DO UPDATE SET mode='platform',updated_by=excluded.updated_by,updated_at=now()`,
      [restaurant, userId],
    );
    return;
  }
  // Refus immédiat d'une adresse interne, avant tout enregistrement.
  await resolvePublicHost(input.host);
  const existing = await rows<{ host: string | null }>(db, "SELECT host FROM email_transports WHERE restaurant_id=$1", [restaurant]);
  const keep = !input.password;
  if (keep && (!existing[0] || existing[0].host !== input.host) && input.username)
    throw new Error("Saisissez le mot de passe SMTP pour ce serveur.");
  const secret = keep ? null : encryptSecret(restaurant, SMTP_SECRET_PROVIDER, input.password);
  // Le secret n'est réécrit que s'il est fourni : la colonne n'est pas lisible par l'application.
  await db.query(
    `INSERT INTO email_transports(restaurant_id,mode,host,port,security,username,secret,from_email,from_name,verified_at,last_error,updated_by)
     VALUES($1,'custom',$2,$3,$4,$5,$6,$7,$8,NULL,NULL,$9)
     ON CONFLICT(restaurant_id) DO UPDATE SET mode='custom',host=excluded.host,port=excluded.port,
       security=excluded.security,username=excluded.username,${keep ? "" : "secret=excluded.secret,"}
       from_email=excluded.from_email,from_name=excluded.from_name,verified_at=NULL,last_error=NULL,
       updated_by=excluded.updated_by,updated_at=now()`,
    [restaurant, input.host, input.port, input.security, input.username || null, secret, input.fromEmail.toLowerCase(), input.fromName || null, userId],
  );
}
