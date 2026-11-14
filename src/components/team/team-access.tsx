"use client";
import { useCallback, useEffect, useState } from "react";
import { entriesForRoles, navigationGroups, unrestricted } from "@/features/team/entries";
import { roleLabels, type Role } from "@/lib/permissions";
import "./team-access.css";

type Member = { id: string; name: string; email: string; role: string };
export type TeamStaff = {
  ready: boolean;
  pinRequired: boolean;
  rows: { profile_id: string; hidden: string[] }[];
  pins: { profile_id: string; set_at: string; locked: boolean; failed_attempts: number }[];
};
type Activity = {
  id: string;
  profile_id: string;
  name: string;
  device_name: string | null;
  kind: string;
  object_id: string | null;
  amount: number | null;
  detail: string;
  created_at: string;
};
type Totals = { profile_id: string; name: string; orders: number; payments: number; amount: number; cancels: number };

const kindLabels: Record<string, string> = {
  order: "Commande prise",
  payment: "Encaissement",
  cancel_item: "Annulation d’un article",
  confirm_order: "Commande acceptée",
  decline_order: "Commande refusée",
  pin_failed: "Code PIN erroné",
  pin_locked: "Code PIN bloqué",
  pin_created: "Code PIN créé ou modifié",
  pin_reset: "Code PIN réinitialisé",
};
const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Administration de l’équipe : codes PIN, visibilité par membre et historique « qui fait quoi ». */
export function TeamAccess({
  restaurant,
  members,
  staff,
  isAdmin,
  busy,
  perform,
}: {
  restaurant: string;
  members: Member[];
  staff?: TeamStaff;
  isAdmin: boolean;
  busy: boolean;
  perform: (body: unknown) => Promise<void> | void;
}) {
  const people = [...new Set(members.map((m) => m.id))].map((id) => ({
    id,
    name: members.find((m) => m.id === id)!.name,
    roles: members.filter((m) => m.id === id).map((m) => m.role as Role),
  }));
  if (!staff?.ready)
    return (
      <section>
        <h2>Codes PIN et visibilité</h2>
        <p>Fonctionnalité en cours d’activation : la mise à jour de la base de données n’est pas encore appliquée.</p>
      </section>
    );
  return (
    <>
      <section className="team-access">
        <h2>Codes PIN de l’équipe</h2>
        <p>
          Chaque membre crée son code PIN à son arrivée dans l’espace de travail. Il sert à valider les prises
          de commande, les encaissements, les annulations et les acceptations de commande : chaque étape est
          enregistrée au nom de la personne, même sur un appareil partagé. Il ne sert jamais à se connecter.
        </p>
        {isAdmin && (
          <label className="inline team-access-toggle">
            <input
              type="checkbox"
              checked={staff.pinRequired}
              disabled={busy}
              onChange={(e) => void perform({ action: "pinRequired", required: e.target.checked })}
            />
            Exiger le code PIN pour valider ces étapes
          </label>
        )}
        <ul className="team-access-pins">
          {people.map((person) => {
            const pin = staff.pins.find((p) => p.profile_id === person.id);
            const noLogin = person.id.startsWith("staff:");
            return (
              <li key={person.id}>
                <span>
                  <b>{person.name}</b>
                  <small>{person.roles.map((r) => roleLabels[r] ?? r).join(", ")}</small>
                </span>
                <span className={`team-access-status ${pin ? (pin.locked ? "locked" : "ok") : "missing"}`}>
                  {noLogin
                    ? "Sans compte de connexion"
                    : pin
                      ? pin.locked
                        ? "Bloqué (trop d’essais)"
                        : `Créé le ${new Date(pin.set_at).toLocaleDateString("fr-FR")}`
                      : "Pas encore créé"}
                </span>
                {isAdmin && pin && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Réinitialiser le code PIN de ${person.name} ? Il devra en créer un nouveau.`))
                        void perform({ action: "resetPin", profile: person.id });
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {isAdmin && (
        <section className="team-access">
          <h2>Ce que voit chaque membre</h2>
          <p>
            Par défaut, chaque membre voit les rubriques de son rôle. Décochez ce qu’il ne doit pas voir : quand toutes
            les rubriques d’un même domaine sont masquées, l’accès aux données correspondantes est aussi coupé.
          </p>
          {people
            .filter((person) => !unrestricted(person.roles))
            .map((person) => (
              <VisibilityEditor
                key={person.id}
                person={person}
                hidden={staff.rows.find((r) => r.profile_id === person.id)?.hidden ?? []}
                busy={busy}
                save={(hidden) => perform({ action: "visibility", profile: person.id, hidden })}
              />
            ))}
          {people.every((person) => unrestricted(person.roles)) && (
            <p>Invitez un collaborateur pour régler ce qu’il voit.</p>
          )}
        </section>
      )}
      <StaffActivity restaurant={restaurant} />
    </>
  );
}

function VisibilityEditor({
  person,
  hidden,
  busy,
  save,
}: {
  person: { id: string; name: string; roles: Role[] };
  hidden: string[];
  busy: boolean;
  save: (hidden: string[]) => Promise<void> | void;
}) {
  const entries = entriesForRoles(person.roles);
  const [draft, setDraft] = useState(hidden);
  useEffect(() => setDraft(hidden), [hidden]);
  const changed = [...draft].sort().join() !== [...hidden].sort().join();
  const visible = entries.filter((e) => !draft.includes(e.id)).length;
  return (
    <details className="team-access-member">
      <summary>
        <b>{person.name}</b>
        <small>
          {visible} rubrique(s) visible(s) sur {entries.length}
        </small>
      </summary>
      <div className="team-access-groups">
        {navigationGroups.map((group) => {
          const items = entries.filter((e) => e.group === group);
          if (!items.length) return null;
          return (
            <fieldset key={group}>
              <legend>{group}</legend>
              {items.map((entry) => (
                <label key={entry.id} className="inline">
                  <input
                    type="checkbox"
                    checked={!draft.includes(entry.id)}
                    onChange={(e) =>
                      setDraft(e.target.checked ? draft.filter((id) => id !== entry.id) : [...draft, entry.id])
                    }
                  />
                  {entry.name}
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="team-access-actions">
        <button type="button" disabled={busy || !draft.length} onClick={() => setDraft([])}>
          Tout afficher
        </button>
        <button type="button" className="primary" disabled={busy || !changed} onClick={() => void save(draft)}>
          Enregistrer pour {person.name}
        </button>
      </div>
    </details>
  );
}

function StaffActivity({ restaurant }: { restaurant: string }) {
  const [member, setMember] = useState(""),
    [kind, setKind] = useState(""),
    [days, setDays] = useState("7"),
    [state, setState] = useState<{ activity: Activity[]; totals: Totals[]; members: { id: string; name: string }[] }>(),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const params = new URLSearchParams({ activity: "1", days });
    if (member) params.set("member", member);
    if (kind) params.set("kind", kind);
    const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/staff?${params}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Historique indisponible.");
    setState(body);
    setError("");
  }, [restaurant, member, kind, days]);
  useEffect(() => {
    void load().catch((e) => setError((e as Error).message));
  }, [load]);
  if (error.includes("Accès refusé")) return null;
  return (
    <section className="team-access">
      <h2>Qui fait quoi</h2>
      <div className="team-access-filters">
        <label>
          Membre
          <select value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">Toute l’équipe</option>
            {state?.members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label>
          Étape
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Toutes</option>
            <option value="order">Commandes prises</option>
            <option value="payment">Encaissements</option>
            <option value="cancel_item">Annulations</option>
            <option value="confirm_order">Commandes acceptées</option>
            <option value="decline_order">Commandes refusées</option>
            <option value="pin">Codes PIN</option>
          </select>
        </label>
        <label>
          Période
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">Aujourd’hui et hier</option>
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {!!state?.totals.length && (
        <div className="team-access-totals">
          {state.totals.map((t) => (
            <article key={t.profile_id}>
              <b>{t.name}</b>
              <span>{t.orders} commande(s)</span>
              <span>{t.payments} encaissement(s) · {euros(t.amount)}</span>
              {t.cancels > 0 && <span>{t.cancels} annulation(s)</span>}
            </article>
          ))}
        </div>
      )}
      {state && !state.activity.length && <p>Aucune étape enregistrée sur cette période.</p>}
      {!!state?.activity.length && (
        <div className="team-access-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Membre</th>
                <th>Étape</th>
                <th>Détail</th>
                <th>Appareil</th>
              </tr>
            </thead>
            <tbody>
              {state.activity.map((a) => (
                <tr key={a.id} className={a.kind.startsWith("pin_") ? "pin" : ""}>
                  <td>{when(a.created_at)}</td>
                  <td>{a.name}</td>
                  <td>{kindLabels[a.kind] ?? a.kind}</td>
                  <td>
                    {[a.amount !== null ? euros(a.amount) : "", a.detail, a.object_id ? `n° ${a.object_id.slice(0, 6)}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td>{a.device_name && a.device_name !== a.name ? `Compte de ${a.device_name}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
