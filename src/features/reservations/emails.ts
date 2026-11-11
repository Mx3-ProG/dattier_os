import type { DB } from "@/lib/database/db";
import { emitEmailEvent } from "@/features/email";

/**
 * Événements de réservation transmis au module « Emails automatiques ».
 * Le module réservation ne connaît que ce contrat : sans add-on ni automatisation
 * activée, l'appel ne fait rien et ne bloque jamais la réservation.
 */
export type ReservationEmailEvent = "reservation.requested" | "reservation.confirmed" | "reservation.cancelled";

export function reservationEmailVars(reservation: { id: string; name: string; guests: number; starts_at: string | Date }) {
  const start = new Date(reservation.starts_at);
  return {
    ref: reservation.id,
    client: reservation.name.trim().split(/\s+/)[0] ?? "",
    couverts: reservation.guests,
    date: start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }),
    heure: start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
  };
}

export function emitReservationEmail(
  db: DB,
  restaurant: string,
  event: ReservationEmailEvent,
  reservation: { id: string; name: string; contact: string; guests: number; starts_at: string | Date; customer_id?: string | null },
) {
  return emitEmailEvent(db, restaurant, event, reservation.contact, reservationEmailVars(reservation), reservation.customer_id);
}
