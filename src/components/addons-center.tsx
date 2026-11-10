"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  addonCollections,
  addonDetails,
  addonDestination,
  addonPriceCents,
  monthlyAddonIds,
} from "@/features/addons/catalog";
import {
  defaultStoreFilters,
  featuresVisible,
  installedAddonCount,
  pilotageCategoryId,
  pilotageMonthlyAddonIds,
  featuresCategoryId,
  type StoreState,
} from "@/features/addons/store-catalog";

import { Button } from "./ui/button";

// Le catalogue et ses animations ne sont téléchargés qu’à l’ouverture de cette page.
const AddonStore = dynamic(() =>
  import("./addons/addon-store").then((m) => m.AddonStore),
);

export function AddonsCenter({
  plan,
  restaurant,
  accountId,
  accessibleModules,
  navigate,
  onModulesChanged,
}: {
  plan: number;
  restaurant: string;
  accountId: string;
  accessibleModules: readonly string[];
  navigate: (module: string) => void;
  onModulesChanged: () => Promise<void>;
}) {
  const [modulesState, setModulesState] = useState<{
    requests: {
      module_id: string;
      requested_state: "enabled" | "suspended";
      applied_state: "enabled" | "suspended";
      revision: number;
    }[];
    suspensionPreflight: {
      floor: {
        openTableSessions: number;
        openTableOrders: number;
        upcomingReservations: number;
        dependentModules: string[];
      };
      tableBooking: { upcomingReservations: number };
    };
  } | null>(null);
  const [state, setState] = useState<{
    plan: number;
    ready: boolean;
    readyAddons: string[];
    legacyGrants: string[];
    admin: boolean;
    demo: boolean;
    subscriptions: {
      addon: string;
      status: string;
      valid_until: string | null;
      renewal_cancelled?: boolean | null;
    }[];
    installations: { addon_id: string; installed: boolean }[];
    storeLicenses: { product_id: string; status: "active" | "disputed" | "revoked"; valid_until: string | null }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"owned" | "shop" | "credits">("owned");
  const [credits, setCredits] = useState<{
    admin: boolean; balance: number | null; ready: boolean; packs: number[];
    orders: { id: string; pack_cents: number; status: string; created_at: string }[];
  } | null>(null);
  useEffect(() => {
    if (view !== "credits") return;
    let alive = true;
    fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/studio-credits`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Crédits indisponibles");
        if (alive) setCredits(result);
      })
      .catch((cause) => { if (alive) setError((cause as Error).message); });
    return () => { alive = false; };
  }, [restaurant, view]);
  async function buyCredits(pack: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/studio-credits`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Recharge indisponible");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Destination de paiement invalide");
      window.location.assign(url.href);
    } catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/addons`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok)
            throw new Error(d.error?.message || "Catalogue indisponible");
          if (alive) {
            setState(d);
            setLoadError("");
          }
        })
        .catch((e) => {
          if (alive) setLoadError(e.message);
        });
    void load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [restaurant]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/modules`)
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((value) => {
        if (alive) setModulesState(value);
      })
      .catch(() => {
        if (alive) setModulesState(null);
      });
    return () => {
      alive = false;
    };
  }, [restaurant]);
  async function changeModule(
    moduleId: "floor" | "table-booking",
    desired: "enabled" | "suspended",
  ) {
    const row = modulesState?.requests.find(
      (request) => request.module_id === moduleId,
    );
    if (
      !window.confirm(
        `${desired === "suspended" ? "Suspendre" : "Activer"} ce module pour tout l’établissement ?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const url = `/api/restaurants/${encodeURIComponent(restaurant)}/modules`;
      const headers = {
        "content-type": "application/json",
        "x-module-account": accountId,
      };
      const requested = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          moduleId,
          requestedState: desired,
          revision: row?.revision ?? 0,
        }),
      });
      const requestResult = await requested.json();
      if (!requested.ok)
        throw new Error(
          requestResult.error?.message || "Modification impossible",
        );
      const applied = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ moduleId, revision: requestResult.revision }),
      });
      const applyResult = await applied.json();
      if (!applied.ok)
        throw new Error(applyResult.error?.message || "Activation impossible");
      const refreshed = await fetch(url);
      if (refreshed.ok) setModulesState(await refreshed.json());
      await onModulesChanged();
      setNotice(
        desired === "suspended"
          ? "Module suspendu pour cet établissement."
          : "Module activé pour cet établissement.",
      );
    } catch (e) {
      setError((e as Error).message);
      const refreshed = await fetch(
        `/api/restaurants/${encodeURIComponent(restaurant)}/modules`,
      ).catch(() => null);
      if (refreshed?.ok) setModulesState(await refreshed.json());
    } finally {
      setBusy(false);
    }
  }
  async function cancel(addon: string) {
    if (
      !window.confirm(
        "Arrêter le renouvellement ? L’accès reste disponible jusqu’à la fin de la période payée.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(
        `/api/restaurants/${encodeURIComponent(restaurant)}/addons?addon=${encodeURIComponent(addon)}`,
        { method: "DELETE" },
      );
      const d = await r.json();
      if (!r.ok)
        throw new Error(d.error?.message || "Résiliation indisponible");
      setNotice(d.message);
      if (d.state) setState(d.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function buy(addon: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/restaurants/${encodeURIComponent(restaurant)}/addons?addon=${encodeURIComponent(addon)}`,
        { method: "POST" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Achat indisponible");
      const url = new URL(d.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("Destination de paiement invalide");
      window.location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function setInstallation(addon: string, installed: boolean) {
    if (!installed && !window.confirm(
      `Désinstaller cet add-on pour l’établissement ? ${addon === "website" ? "Le site public ne sera plus accessible. " : ""}Les données et le droit d’accès seront conservés.`,
    )) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/addons/store`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-installation", product: addon, installed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Modification impossible");
      setState((current) => current ? { ...current, installations: result.installations } : current);
      await onModulesChanged();
      setNotice(installed ? "Add-on réinstallé sans nouveau paiement." : "Add-on désinstallé. Vos données et votre droit d’accès sont conservés.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const [filters, setFilters] = useState(defaultStoreFilters);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const collections = state
    ? addonCollections(state.plan ?? plan, state.subscriptions, now, state.legacyGrants)
    : null;
  const installedCount = installedAddonCount(
    collections?.owned.map((addon) => addon.id) ?? [],
    state?.storeLicenses ?? [],
    state?.installations ?? [],
    now,
  );
  const isLegacyInstalled = (id: string) =>
    state?.installations?.find((entry) => entry.addon_id === id)?.installed !== false;
  const monthlyShopEntries = collections
    ? state?.demo
      ? [...collections.shop, ...collections.owned.filter((addon) => monthlyAddonIds.some((id) => id === addon.id))]
      : collections.shop
    : [];
  const entries = view === "owned"
    ? collections?.owned.filter((addon) => isLegacyInstalled(addon.id))
    : monthlyShopEntries.filter((addon) =>
        filters.category === "all" ||
        (filters.category === pilotageCategoryId && pilotageMonthlyAddonIds.has(addon.id)) ||
        (filters.category === featuresCategoryId && !pilotageMonthlyAddonIds.has(addon.id)),
      );
  const uninstalledEntries = view === "owned"
    ? collections?.owned.filter((addon) => !isLegacyInstalled(addon.id)) ?? []
    : [];
  const handleStoreChange = async (next: StoreState) => {
    setState((current) => current ? {
      ...current,
      installations: next.installations,
      storeLicenses: next.licenses.map((license) => ({
        product_id: license.product_id,
        status: license.status,
        valid_until: license.valid_until ?? null,
      })),
    } : current);
    await onModulesChanged();
  };
  return (
    <section aria-label="Gestion des add-ons">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <p>
        Retrouvez les fonctionnalités de votre établissement et découvrez celles
        que vous pouvez ajouter pour votre équipe.
      </p>
      <div
        role="group"
        aria-label="Vues des add-ons"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBlock: 20 }}
      >
        <Button
          variant={view === "owned" ? "default" : "secondary"}
          aria-pressed={view === "owned"}
          onClick={() => setView("owned")}
        >
          Mes add-ons{collections ? ` (${installedCount})` : ""}
        </Button>
        <Button
          variant={view === "shop" ? "default" : "secondary"}
          aria-pressed={view === "shop"}
          onClick={() => setView("shop")}
        >
          Boutique d’add-ons
        </Button>
        <Button
          variant={view === "credits" ? "default" : "secondary"}
          aria-pressed={view === "credits"}
          onClick={() => setView("credits")}
        >
          Crédits Studio
        </Button>
      </div>
      {view === "shop" && (
        <AddonStore
          restaurant={restaurant}
          mode="shop"
          filters={filters}
          onFiltersChange={setFilters}
          onOpenShop={() => setView("shop")}
          onOpenModule={navigate}
          monthlyShopCount={monthlyShopEntries.length}
          pilotageMonthlyShopCount={monthlyShopEntries.filter((addon) => pilotageMonthlyAddonIds.has(addon.id)).length}
          onLicensesChanged={handleStoreChange}
        />
      )}
      {view !== "credits" && (view === "owned" || featuresVisible(filters)) ? (
        <section
          aria-label={view === "owned" ? "Mes add-ons" : "Boutique d’add-ons"}
        >
          <h2>{view === "owned" ? "Mes add-ons" : "Boutique d’add-ons"}</h2>
          <p>
            {view === "owned"
              ? state?.demo ? "Les add-ons de la démo sont utilisables sans paiement. L’accès de chaque membre dépend de ses permissions." : "Les fonctionnalités incluses dans votre forfait et vos abonnements actifs. L’accès de chaque membre dépend de ses permissions."
              : state?.demo ? "Explorez les add-ons avec un accès de démonstration. Leur tarif commercial reste indiqué sur chaque fiche." : "Les fonctionnalités qui ne sont pas encore incluses ou actives pour cet établissement."}
          </p>
          {view === "shop" && (
            <p>
              <strong>Tarif mensuel TTC indiqué sur chaque add-on.</strong>{" "}
              {state?.demo ? "Ces abonnements sont utilisables dans la démo sans paiement. Sur un établissement réel, leur tarif reste applicable." : "Par établissement. Les achats ouvrent progressivement ; le paiement est disponible en mode test pour les modules configurés."}
            </p>
          )}
          {!collections && (
            <p role="status">
              {loadError
                ? "Impossible de vérifier vos add-ons pour le moment. Une nouvelle tentative est effectuée automatiquement."
                : "Chargement de vos add-ons…"}
            </p>
          )}
          {entries?.length === 0 && (
            <div className="card" style={{ padding: 20 }}>
              <p>
                {view === "owned"
                  ? "Vous ne possédez pas encore d’add-on de ce catalogue."
                  : "Vous possédez déjà tous les add-ons de ce catalogue. D’autres fonctionnalités seront proposées progressivement."}
              </p>
              <Button
                variant="secondary"
                onClick={() => setView(view === "owned" ? "shop" : "owned")}
              >
                {view === "owned"
                  ? "Découvrir la boutique"
                  : "Voir mes add-ons"}
              </Button>
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
              gap: 16,
              marginBlock: 24,
            }}
          >
            {entries?.map((addon) => {
              const installed = state?.installations?.find((entry) => entry.addon_id === addon.id)?.installed !== false;
              const details = addonDetails[addon.id];
              const destination = addonDestination(
                addon.id,
                (addon.included || addon.active) && installed,
                accessibleModules,
              );
              return (
                <article
                  className="card"
                  aria-label={addon.name}
                  key={addon.id}
                  style={{ borderRadius: 16, padding: 20 }}
                >
                  <h3>{addon.name}</h3>
                  <p>{addon.description}</p>
                  {(addon.included || addon.active) && (
                    <p><strong>{installed ? "Installé" : "Désinstallé"}</strong> · {state?.demo && monthlyAddonIds.some((id) => id === addon.id) ? "accès d’essai démo" : addon.validUntil ? `accès valable jusqu’au ${new Date(addon.validUntil).toLocaleDateString("fr-FR")}` : "accès inclus dans le forfait"}</p>
                  )}
                  {state?.admin && (addon.included || addon.active) && (
                    <Button variant="secondary" disabled={busy} onClick={() => void setInstallation(addon.id, !installed)}>
                      {installed ? "Désinstaller" : "Réinstaller sans paiement"}
                    </Button>
                  )}
                  {state?.admin && installed &&
                    modulesState &&
                    (addon.id === "floor" || addon.id === "booking") && (
                      <div>
                        <p>
                          <strong>
                            {modulesState.requests.find(
                              (row) =>
                                row.module_id ===
                                (addon.id === "booking"
                                  ? "table-booking"
                                  : "floor"),
                            )?.applied_state === "suspended"
                              ? "Suspendu"
                              : "Activé"}
                          </strong>{" "}
                          pour cet établissement.
                        </p>
                        {addon.id === "floor" && (
                          <p>
                            Services ouverts :{" "}
                            {
                              modulesState.suspensionPreflight.floor
                                .openTableSessions
                            }{" "}
                            ; commandes de table en cours :{" "}
                            {
                              modulesState.suspensionPreflight.floor
                                .openTableOrders
                            }
                            . Suspendez d’abord les réservations.
                          </p>
                        )}
                        {addon.id === "booking" && (
                          <p>
                            Réservations à venir :{" "}
                            {
                              modulesState.suspensionPreflight.tableBooking
                                .upcomingReservations
                            }
                            .
                          </p>
                        )}
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            const id =
                              addon.id === "booking"
                                ? "table-booking"
                                : "floor";
                            const active =
                              modulesState.requests.find(
                                (row) => row.module_id === id,
                              )?.applied_state !== "suspended";
                            void changeModule(
                              id,
                              active ? "suspended" : "enabled",
                            );
                          }}
                        >
                          {modulesState.requests.find(
                            (row) =>
                              row.module_id ===
                              (addon.id === "booking"
                                ? "table-booking"
                                : "floor"),
                          )?.applied_state === "suspended"
                            ? "Réactiver"
                            : "Suspendre"}
                        </Button>
                      </div>
                    )}
                  <p>
                    <strong>
                      {state?.demo && monthlyAddonIds.some((id) => id === addon.id)
                        ? `Essai démo · ${addonPriceCents(addon.id) / 100} € TTC / mois hors démo`
                        : addon.included
                        ? state?.legacyGrants.includes(addon.id) ? "Accès historique conservé" : "Inclus dans votre forfait"
                        : addon.active
                          ? "Actif · abonnement de test"
                          : addon.pending
                            ? "Paiement de test en attente"
                            : `${addonPriceCents(addon.id) / 100} € TTC / mois`}
                    </strong>
                  </p>
                  {destination && (
                    <Button onClick={() => navigate(destination)}>
                      {details.action}
                    </Button>
                  )}
                  {(addon.included || addon.active) && !destination && (
                    <p>
                      Cette fonctionnalité n’est pas accessible depuis votre
                      profil pour le moment.
                    </p>
                  )}
                  <details style={{ marginBlock: 16 }}>
                    <summary>Découvrir {addon.name}</summary>
                    <h4>Ce que vous pouvez faire</h4>
                    <ul>
                      {details.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <h4>Exemple d’utilisation</h4>
                    <p>{details.example}</p>
                    <p>
                      La consultation de cette fiche n’active aucun abonnement.
                    </p>
                  </details>
                  {!addon.included &&
                    !addon.active &&
                    addon.includedFrom === null && (
                      <Button
                        disabled={busy || !state?.readyAddons.includes(addon.id) || !state.admin}
                        onClick={() => void buy(addon.id)}
                      >
                        {busy
                          ? "Ouverture…"
                          : addon.pending
                            ? "Reprendre le paiement · test"
                            : "Souscrire avec Stripe · test"}
                      </Button>
                    )}
                  {view === "shop" && addon.includedFrom !== null && (
                    <p>Bientôt disponible à l’achat.</p>
                  )}
                  {!addon.included &&
                    !addon.active &&
                    addon.includedFrom === null &&
                    !state?.readyAddons.includes(addon.id) && (
                      <p>
                        L’achat en mode test n’est pas encore ouvert pour cet
                        établissement.
                      </p>
                    )}
                  {!addon.included &&
                    !addon.active &&
                    addon.includedFrom === null &&
                    state?.readyAddons.includes(addon.id) &&
                    !state.admin && (
                      <p>
                        L’achat est réservé à l’administrateur de
                        l’organisation.
                      </p>
                    )}
                  {addon.active && (
                    <div>
                      {addon.validUntil && (
                        <p>
                          Période payée jusqu’au{" "}
                          {new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "long",
                            timeStyle: "short",
                            timeZone: "Europe/Paris",
                          }).format(new Date(addon.validUntil))}{" "}
                          (heure de Paris).
                        </p>
                      )}
                      <p>
                        <strong>
                          {addon.renewalCancelled === true
                            ? "Renouvellement arrêté"
                            : addon.renewalCancelled === false
                              ? "Renouvellement automatique"
                              : "État du renouvellement non encore vérifié"}
                        </strong>
                      </p>
                      {addon.renewalCancelled === true && (
                        <p>
                          {addon.included
                            ? "L’abonnement supplémentaire ne sera pas renouvelé. La fonctionnalité reste incluse dans votre forfait."
                            : "Votre accès reste disponible jusqu’à la fin de la période payée."}
                        </p>
                      )}
                      {addon.included && addon.renewalCancelled !== true && (
                        <p>
                          Cette fonctionnalité est aussi incluse dans votre
                          forfait. Vous pouvez arrêter le renouvellement de cet
                          abonnement supplémentaire.
                        </p>
                      )}
                      {addon.includedFrom === null &&
                        state?.admin &&
                        addon.renewalCancelled !== true && (
                          <Button
                            variant="secondary"
                            disabled={busy || !state.readyAddons.includes(addon.id)}
                            onClick={() => void cancel(addon.id)}
                          >
                            Arrêter le renouvellement
                          </Button>
                        )}
                    </div>
                  )}
                  {addon.usage && (
                    <p>
                      Extraction par IA : consommation de crédits distincte. Les
                      conditions actuelles restent applicables.
                    </p>
                  )}
                  <details>
                    <summary>Comprendre l’accès</summary>
                    <p>
                      {addon.included
                        ? "Aucun supplément d’abonnement pour cette fonctionnalité. Les permissions de chaque membre continuent de s’appliquer."
                        : addon.active
                          ? "L’abonnement de test est actif jusqu’à la fin de sa période payée. Les permissions de chaque membre continuent de s’appliquer."
                          : "L’ajout d’une fonctionnalité bénéficiera à votre équipe dans cet établissement, selon les droits de chaque membre."}
                    </p>
                  </details>
                </article>
              );
            })}
          </div>
          {uninstalledEntries.length > 0 && (
            <section aria-label="Add-ons désinstallés">
              <h3>À réinstaller</h3>
              <p>Ces add-ons restent acquis et ne sont pas comptés parmi les add-ons installés.</p>
              <ul>
                {uninstalledEntries.map((addon) => (
                  <li key={addon.id}>
                    {addon.name}{" "}
                    {state?.admin && (
                      <Button variant="secondary" disabled={busy} onClick={() => void setInstallation(addon.id, true)}>
                        Réinstaller sans paiement
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      ) : view !== "credits" ? null : (
        <section aria-label="Crédits Studio">
          <h2>Un budget pour les usages à la consommation</h2>
          <p>
            Les crédits serviront aux traitements payants, comme l’IA ou
            certains envois. Les fonctionnalités sans consommation externe ne
            débiteront pas ce portefeuille.
          </p>
          <p>Solde : <strong>{credits?.balance == null ? "—" : `${(credits.balance / 100).toFixed(2)} €`}</strong></p>
          {credits?.admin && credits.ready ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {credits.packs.map((pack) => <Button key={pack} disabled={busy} onClick={() => void buyCredits(pack)}>
                Acheter {(pack / 100).toFixed(2)} € de crédits · test
              </Button>)}
            </div>
          ) : <p>Recharge de test indisponible actuellement.</p>}
          {credits?.admin && credits.orders.length > 0 && <section aria-label="Historique des recharges">
            <h3>Recharges récentes</h3>
            <ul>{credits.orders.map((order) => <li key={order.id}>
              {(order.pack_cents / 100).toFixed(2)} € · {order.status} · {new Date(order.created_at).toLocaleDateString("fr-FR")}
            </li>)}</ul>
          </section>}
          <p>
            Votre solde STUDIO VOICE et ses packs restent inchangés et
            accessibles dans l’assistant. Aucun crédit existant n’est converti
            ici.
          </p>
        </section>
      )}
      {view === "owned" && (
        <AddonStore
          restaurant={restaurant}
          mode="library"
          filters={filters}
          onFiltersChange={setFilters}
          onOpenShop={() => setView("shop")}
          onLicensesChanged={handleStoreChange}
        />
      )}
    </section>
  );
}
