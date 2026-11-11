import type { DB } from "@/lib/database/db";
import type { ClaimedMessage, DeliveryContext, RenderPort, TransportPort } from "./port";

/**
 * Livraison en trois temps, pour ne jamais tenir une transaction pendant un appel réseau :
 * 1. réserver les messages et lire le contexte (courte transaction) ;
 * 2. rendre et envoyer, hors transaction ;
 * 3. solder chaque message (courte transaction).
 * La réservation (`app.email_claim`) est atomique : le worker et le serveur web peuvent
 * vider la même file en parallèle sans double envoi.
 */
export type Run = <T>(fn: (db: DB) => Promise<T>) => Promise<T>;

export type DeliveryResult = { id: string; status: "sent" | "demo" | "error" | "skipped"; error?: string };

/** Erreurs SMTP définitives (adresse refusée, authentification) : pas de nouvelle tentative. */
const permanent = (error: unknown) => {
  const code = (error as { responseCode?: number; code?: string }) ?? {};
  return (typeof code.responseCode === "number" && code.responseCode >= 500) || code.code === "EAUTH" || code.code === "EENVELOPE";
};

export function createEngine(ports: { render: RenderPort; transport: TransportPort }) {
  return {
    async deliver(run: Run, restaurant: string, options: { only?: string; max?: number } = {}): Promise<DeliveryResult[]> {
      const claimed = await run(async (db) => {
        const { rows } = await db.query<ClaimedMessage>(
          "SELECT * FROM app.email_claim($1,$2,$3)",
          [restaurant, options.only ?? null, options.max ?? 10],
        );
        if (!rows.length) return null;
        const context = await db.query<{ context: DeliveryContext }>(
          "SELECT app.email_delivery_context($1) AS context",
          [restaurant],
        );
        return { messages: rows, context: context.rows[0].context };
      });
      if (!claimed) return [];
      const results: DeliveryResult[] = [];
      for (const message of claimed.messages) {
        let outcome: DeliveryResult["status"] = "error",
          subject: string | null = null,
          html: string | null = null,
          transportKind: string | null = null,
          providerId: string | null = null,
          failure: string | null = null,
          retry = false;
        try {
          const rendered = ports.render(message, claimed.context);
          subject = rendered.subject;
          html = rendered.html;
          const transport = await ports.transport(restaurant, message, claimed.context);
          transportKind = transport.kind;
          if (!transport.live) outcome = "demo";
          else {
            providerId = (
              await transport.send({
                to: message.recipient,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                fromName: rendered.fromName,
                replyTo: rendered.replyTo,
                messageId: message.id,
                headers: rendered.marketing && rendered.replyTo
                  ? { "List-Unsubscribe": `<mailto:${rendered.replyTo}?subject=desinscription>` }
                  : undefined,
              })
            ).providerId;
            outcome = "sent";
          }
        } catch (error) {
          outcome = "error";
          failure = ((error as Error).message || "Envoi impossible.").slice(0, 300);
          retry = !permanent(error) && message.origin !== "test";
        }
        await run((db) =>
          db.query("SELECT app.email_complete($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
            restaurant, message.id, outcome, subject, html, transportKind, providerId, failure, retry,
          ]),
        );
        results.push({ id: message.id, status: outcome, error: failure ?? undefined });
      }
      return results;
    },
  };
}
