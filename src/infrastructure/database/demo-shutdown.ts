/**
 * Fermeture propre de la base de démonstration (PGlite) à l'arrêt du processus.
 *
 * PGlite n'écrit son point de contrôle qu'à `close()`. Un processus arrêté sans
 * fermeture peut laisser une base qui refuse de redémarrer (« could not locate a valid
 * checkpoint record », incident du 10 novembre 2026, docs/platform/CORE-ET-MODULES.md).
 *
 * Next.js (`start-server`) gère lui-même SIGINT/SIGTERM : il ferme le serveur HTTP puis
 * appelle `process.exit`. Ce module :
 * 1. commence la fermeture de la base dès la réception du signal (écouteur placé en tête) ;
 * 2. retarde tout `process.exit` jusqu'à la fin de cette fermeture (bornée par un délai),
 *    pour que la sortie de Next n'interrompe pas l'écriture.
 * Le parent `next dev` tue l'enfant après NEXT_EXIT_TIMEOUT_MS (100 ms par défaut) :
 * le script `npm run dev` le porte à 5 s.
 */
type ShutdownProcess = Pick<NodeJS.Process, "prependListener" | "exit">;

/** Code de sortie conventionnel 128 + numéro du signal. */
const signals = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
const state = globalThis as typeof globalThis & { atacuisineDemoShutdown?: boolean };

export function closeOnShutdown(
  close: () => Promise<unknown>,
  proc: ShutdownProcess = process,
  timeoutMs = 4000,
) {
  // Un seul enregistrement par processus, même si le module est rechargé (HMR).
  if (proc === process) {
    if (state.atacuisineDemoShutdown) return;
    state.atacuisineDemoShutdown = true;
    console.info("Base de démonstration : fermeture propre activée à l’arrêt.");
  }
  let closing: Promise<void> | null = null;
  const realExit = proc.exit.bind(proc) as (code?: number) => never;
  const start = () => {
    if (closing) return closing;
    closing = Promise.race([
      close().then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
    ]).catch((error) => {
      console.error("Fermeture de la base de démonstration impossible :", error);
    });
    // Toute sortie demandée pendant la fermeture attend sa fin.
    proc.exit = ((code?: number) => {
      void closing!.finally(() => realExit(code));
    }) as typeof proc.exit;
    return closing;
  };
  for (const [signal, code] of Object.entries(signals))
    proc.prependListener(signal as keyof typeof signals, () => {
      // Avec Next, sa propre sortie (retardée ci-dessus) arrive en premier. Sans autre
      // gestionnaire, un écouteur empêche la sortie par défaut : on la garantit ici.
      void start().then(() => setTimeout(() => realExit(code), 1000));
    });
  return start;
}
