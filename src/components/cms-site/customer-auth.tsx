"use client";
import { useState } from "react";
import { TenantLink, useTenantSite } from "./context";
export type CustomerIdentity = { id: string; name: string; email: string };
export function CustomerAuth({
  onAuthenticated,
  compact = false,
}: {
  onAuthenticated: (identity: CustomerIdentity) => void;
  compact?: boolean;
  initialMode?: "login" | "register" | "forgot" | "reset";
  resetToken?: string;
}) {
  const { base, demo, shopPost } = useTenantSite();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className={compact ? "donut-auth compact" : "donut-auth"}>
      <h2>Votre espace client</h2>
      <p>
        Connectez-vous pour retrouver vos commandes, vos avis et votre fidélité
        dans ce restaurant.
      </p>
      <a
        className="donut-button"
        href={`/auth/login?returnTo=${encodeURIComponent(base + "/compte")}`}
      >
        Créer mon compte ou me connecter
      </a>
      <p>
        La récupération du mot de passe est disponible depuis l’écran de
        connexion.
      </p>
      {demo && (
        <button
          disabled={busy}
          className="donut-button outline"
          onClick={async () => {
            setBusy(true);
            try {
              onAuthenticated(await shopPost("customer-demo", {}));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Essayer le compte client fictif
        </button>
      )}
      {error && (
        <p className="donut-error" role="alert">
          {error}
        </p>
      )}
      <TenantLink href="/confidentialite">Confidentialité</TenantLink>
    </section>
  );
}
