import { randomUUID as uuid } from "node:crypto";
import { rows, type DB } from "@/lib/database/db";
import type { Permission } from "@/lib/permissions";
import { category, type CategoryId } from "./categories";
import {
  isNotificationType,
  notificationCatalog,
  type Priority,
} from "@/features/notifications/catalog";
/**
 * Événement métier, écrit dans la transaction de l’opération qui le produit :
 * un rollback n’en laisse aucune trace. Socle de l’historique opérationnel et
 * des futures automatisations ; le journal de sécurité reste `audit_logs`.
 */
export type DomainEvent = {
  type: string;
  /** Rubrique d’activité (identifiant de module, cf. `categories.ts`). */
  module: CategoryId;
  summary: string;
  actor?: string | null;
  objectId?: string | null;
  data?: Record<string, unknown>;
  /** Visibilité ; par défaut celle du catalogue de notifications, sinon de la rubrique. */
  permissions?: Permission[] | null;
  notification?: {
    /** Notification réservée à ce profil. */
    recipient?: string;
    /** Une seule notification par clé et par établissement. */
    dedupKey?: string;
    priority?: Priority;
    /** Destinataires plus restreints que la visibilité de l’événement dans l’historique. */
    permissions?: Permission[];
  };
};
/** Retourne l’identifiant de l’événement, ou `null` s’il était déjà notifié (clé de dédoublonnage). */
export async function emit(db: DB, r: string, e: DomainEvent) {
  const kind = isNotificationType(e.type) ? notificationCatalog[e.type] : null;
  const dedup = e.notification?.dedupKey ?? null;
  if (
    kind &&
    dedup &&
    (
      await rows(
        db,
        "SELECT 1 FROM notifications WHERE restaurant_id=$1 AND dedup_key=$2",
        [r, dedup],
      )
    ).length
  )
    return null;
  const id = uuid();
  const permissions =
    e.permissions !== undefined
      ? e.permissions
      : kind && "permissions" in kind
        ? kind.permissions
        : category(e.module).permissions;
  await db.query(
    "INSERT INTO domain_events(id,restaurant_id,type,module,actor,object_id,summary,data,permissions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      r,
      e.type,
      e.module,
      e.actor ?? null,
      e.objectId ?? null,
      e.summary,
      JSON.stringify(e.data ?? {}),
      permissions,
    ],
  );
  if (kind)
    await db.query(
      "INSERT INTO notifications(id,restaurant_id,message,type,priority,module,object_id,permissions,recipient,event_id,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING",
      [
        uuid(),
        r,
        e.summary,
        e.type,
        e.notification?.priority ?? kind.priority,
        e.module,
        e.objectId ?? null,
        e.notification?.recipient
          ? null
          : (e.notification?.permissions ?? permissions),
        e.notification?.recipient ?? null,
        id,
        dedup,
      ],
    );
  return id;
}
