/**
 * Groupes de workers : chaque groupe a ses processus, sa concurrence et ses limites
 * de ressources (compose.yaml). Un transcodage ou un scan ne retarde donc jamais un
 * paiement. Voir docs/platform/WORKER_GROUPS.md.
 */
export const WORKER_GROUPS = {
  /** L'argent et les commandes : doit rester réactif quoi qu'il arrive ailleurs. */
  critical: {
    kinds: [
      "stripe_event",
      "stripe_payout",
      "payout_schedule",
      "online_order_timeout",
    ],
    concurrency: 4,
  },
  /** Ressources lourdes et longues : isolées pour ne rien bloquer d'autre. */
  media: { kinds: ["media_transcode"], concurrency: 1 },
  /**
   * Tout le reste. Il prend aussi les types inconnus : un nouveau type de job sans
   * groupe échoue de façon visible au lieu de rester éternellement en attente.
   */
  maintenance: { kinds: null, concurrency: 2 },
} as const;

export type WorkerGroup = keyof typeof WORKER_GROUPS;

/** Plafond de jobs simultanés par restaurant et par groupe. */
export const TENANT_CAP = 1;

export type Claim = {
  group: string;
  kinds: string[] | null;
  excluded: string[] | null;
  concurrency: number;
};

/** `all` garde le comportement historique : un seul processus traite tout, en développement. */
export function claimFor(
  name: string | undefined,
  concurrency?: number,
): Claim {
  const group = name || "all";
  const override =
    concurrency && Number.isSafeInteger(concurrency) && concurrency > 0
      ? concurrency
      : undefined;
  if (group === "all")
    return {
      group,
      kinds: null,
      excluded: null,
      concurrency: override ?? 1,
    };
  if (!(group in WORKER_GROUPS))
    throw new Error(`WORKER_GROUP inconnu : ${group}.`);
  const config = WORKER_GROUPS[group as WorkerGroup];
  return {
    group,
    kinds: config.kinds ? [...config.kinds] : null,
    excluded: config.kinds
      ? null
      : Object.values(WORKER_GROUPS).flatMap((g) => g.kinds ?? []),
    concurrency: override ?? config.concurrency,
  };
}
