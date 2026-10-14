"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/domain";
type Reward = {
  name: string;
  code: string;
  kind: string;
  value: number;
  expires_on: string;
  status: string;
  expired: boolean;
  restaurant: string;
};
export default function RewardPage() {
  const [data, setData] = useState<Reward | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const token =
      new URLSearchParams(window.location.search).get("token") || "";
    const refresh = () =>
      fetch(`/api/v1/reward?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((d) =>
          d.error
            ? setError("Lien privé invalide ou indisponible.")
            : setData(d),
        )
        .catch(() => setError("Connexion impossible."));
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main className="demo">
      <span className="eyebrow">DATTIER · VOTRE AVANTAGE PERSONNEL</span>
      <h1>Un plaisir à retrouver.</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : data ? (
        <article className="card reward">
          <p>
            {data.name}, votre avantage chez {data.restaurant}
          </p>
          <h2>
            {data.kind === "percent" ? `${data.value} %` : money(data.value)} de
            remise
          </h2>
          <p>Présentez ce code à l’équipe lors du règlement déclaré :</p>
          <strong className="promo-code">{data.code}</strong>
          <p>
            Valable jusqu’au {data.expires_on.slice(0, 10)} · une seule
            utilisation
          </p>
          <span className="badge">
            {data.status === "redeemed"
              ? "Déjà utilisé"
              : data.status === "cancelled"
                ? "Annulé"
                : data.expired
                  ? "Expiré"
                  : "Disponible"}
          </span>
          <p className="muted">
            Réservé au client nommé ci-dessus. Non cumulable avec un autre code
            sur la même addition. La remise ne dépasse pas le total ; le
            reliquat éventuel n’est pas conservé.
          </p>
        </article>
      ) : (
        <p>Chargement de votre avantage…</p>
      )}
      <small>
        Démonstration locale · aucun avantage réel accordé par le restaurant.
        <br />
        Ce lien privé ne constitue pas un compte client authentifié.
      </small>
    </main>
  );
}
