"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import {
  localState,
  updateLocal,
  queueOrder,
  available,
  type LocalState,
  type Quota,
} from "@/features/offline/client";
import "./platform.css";
export function OfflineDesk() {
  const [restaurant, setRestaurant] = useState(""),
    [state, setState] = useState<LocalState>(),
    [loaded, setLoaded] = useState(false),
    [online, setOnline] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [table, setTable] = useState(""),
    [cart, setCart] = useState<Record<string, number>>({}),
    [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]),
    [menu, setMenu] = useState(""),
    [quantity, setQuantity] = useState(5),
    [name, setName] = useState("Poste de service"),
    [confirmed, setConfirmed] = useState(false);
  const key = `restaurant:${restaurant}`;
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("restaurant");
    let id = requested || "";
    try {
      if (requested)
        localStorage.setItem("dattier-offline-last-restaurant", requested);
      else id = localStorage.getItem("dattier-offline-last-restaurant") || "";
    } catch {}

    setRestaurant(id);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const load = useCallback(async () => {
    if (restaurant) {
      setState(await localState(key));
      setLoaded(true);
    }
  }, [restaurant, key]);
  useEffect(() => {
    void load();
  }, [load]);
  async function api(body?: unknown) {
    const response = await fetch(
      `/api/restaurants/${encodeURIComponent(restaurant)}/offline`,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message || "Connexion requise.");
    return data;
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function configure() {
    const device = await api({ action: "register", name });
    setState(
      await updateLocal(key, () => ({
        key,
        device: device.id,
        restaurant,
        name,
        quotas: [],
        events: [],
      })),
    );
  }
  async function refresh() {
    const data = await api();
    if (!state) return;
    const quotas = data.quotas.filter(
      (q: Quota & { device_id: string }) => q.device_id === state.device,
    );
    setState(
      await updateLocal(key, (s) => ({
        ...s!,
        quotas,
        events: s!.events.map((event) => {
          const saved = data.operations.find(
            (op: { id: string }) => op.id === event.id,
          );
          return saved
            ? { ...event, state: saved.status, error: saved.error }
            : event;
        }),
      })),
    );
  }
  async function sync() {
    if (!state) return;
    const current = await localState(key);
    const pending = current!.events.filter((e) => e.state === "pending");
    if (pending.length) {
      const data = await api({
        action: "sync",
        device: state.device,
        events: pending.map(({ state: status, error: message, ...event }) => {
          void status;
          void message;
          return event;
        }),
      });
      setState(
        await updateLocal(key, (s) => ({
          ...s!,
          events: s!.events.map((e) => {
            const result = data.results.find(
              (r: { id: string }) => r.id === e.id,
            );
            return result
              ? { ...e, state: result.status, error: result.error }
              : e;
          }),
        })),
      );
    }
    await refresh();
  }
  const orders = state?.events.filter((e) => e.kind === "order") || [];
  return (
    <main className="platform">
      <header>
        <Link href="/platform">← Mes restaurants</Link>
        <h1>Poste de service hors ligne</h1>
        <p role="status">
          {online ? "Connexion disponible" : "Hors ligne"} · Les tickets restent
          sur cet appareil pendant la coupure.
        </p>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!restaurant ? (
        <p>Ouvrez le poste depuis votre restaurant.</p>
      ) : !state || state.closed ? (
        <section>
          <h2>Préparer cet appareil</h2>
          <p>Connectez-vous et réservez un quota avant toute coupure.</p>
          <label>
            Nom du poste
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button
            disabled={busy || !online || !loaded}
            onClick={() => action(configure)}
          >
            Enregistrer cet appareil
          </button>
        </section>
      ) : (
        <>
          <section>
            <h2>{state.name}</h2>
            <p>
              {state.events.filter((e) => e.state === "pending").length}{" "}
              opérations à synchroniser ·{" "}
              {state.events.filter((e) => e.state === "conflict").length}{" "}
              conflits
            </p>
            <div className="actions">
              <button disabled={busy || !online} onClick={() => action(sync)}>
                Synchroniser
              </button>
              <button
                disabled={busy || !online}
                onClick={() =>
                  action(async () => {
                    const r = await fetch(
                      `/api/v1/state?restaurant=${encodeURIComponent(restaurant)}`,
                    );
                    const d = await r.json();
                    if (!r.ok) throw new Error("Connexion requise.");
                    setCatalog(
                      d.menu.filter((p: { enabled: boolean }) => p.enabled),
                    );
                  })
                }
              >
                Charger la carte
              </button>
            </div>
            {catalog.length > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api({
                      action: "allocate",
                      device: state.device,
                      menu,
                      quantity,
                    });
                    await refresh();
                  });
                }}
              >
                <label>
                  Produit
                  <select
                    required
                    value={menu}
                    onChange={(e) => setMenu(e.target.value)}
                  >
                    <option value="">Choisir</option>
                    {catalog.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Portions à réserver
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </label>
                <button disabled={busy || !online}>
                  Réserver le stock pour cet appareil
                </button>
              </form>
            )}
          </section>
          <section>
            <h2>Nouvelle commande locale</h2>
            <label>
              Repère de table
              <input
                maxLength={80}
                value={table}
                onChange={(e) => setTable(e.target.value)}
              />
            </label>
            {state.quotas.map((q) => (
              <label key={q.id}>
                {q.catalog.name} · {available(state, q)} disponibles · jusqu’au{" "}
                {q.catalog.expiresOn}
                <input
                  aria-label={`Quantité ${q.catalog.name}`}
                  type="number"
                  min="0"
                  max={Math.max(0, available(state, q))}
                  value={cart[q.id] || 0}
                  onChange={(e) =>
                    setCart({ ...cart, [q.id]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <button
              disabled={busy || !state.quotas.length}
              onClick={() =>
                action(async () => {
                  setState(
                    await queueOrder(
                      key,
                      Object.entries(cart)
                        .filter(([, quantity]) => quantity > 0)
                        .map(([quota, quantity]) => ({ quota, quantity })),
                      table,
                    ),
                  );
                  setCart({});
                  setTable("");
                })
              }
            >
              Enregistrer sur cet appareil
            </button>
            <p>
              Aucun paiement externe n’est confirmé depuis ce poste hors ligne.
            </p>
          </section>
          <section>
            <h2>Tickets de cet appareil</h2>
            {orders.map((o) => {
              const events = state.events.filter((e) => e.order === o.order);
              const latest = events.at(-1)!;
              return (
                <article key={o.id}>
                  <h3>
                    {o.table || "Sur place"} · {o.order.slice(0, 8)}
                  </h3>
                  <p>
                    {o.items
                      ?.map(
                        (i) =>
                          `${i.quantity} × ${state.quotas.find((q) => q.id === i.quota)?.catalog.name || "Produit"}`,
                      )
                      .join(", ")}
                  </p>
                  <p>
                    {latest.kind} · {latest.state}
                    {latest.error ? ` · ${latest.error}` : ""}
                  </p>
                  <div className="actions">
                    {(latest.kind === "order"
                      ? ["preparing", "cancelled"]
                      : latest.kind === "preparing"
                        ? ["ready", "cancelled"]
                        : latest.kind === "ready"
                          ? ["served"]
                          : []
                    ).map((kind) => (
                      <button
                        key={kind}
                        disabled={
                          busy ||
                          ["conflict", "resolved"].includes(latest.state)
                        }
                        onClick={() =>
                          action(async () => {
                            setState(
                              await updateLocal(key, (s) => ({
                                ...s!,
                                events: [
                                  ...s!.events,
                                  {
                                    id: crypto.randomUUID(),
                                    order: o.order,
                                    kind: kind as "preparing",
                                    at: new Date().toISOString(),
                                    state: "pending",
                                  },
                                ],
                              })),
                            );
                          })
                        }
                      >
                        {
                          (
                            {
                              preparing: "Commencer",
                              ready: "Prêt",
                              served: "Servi",
                              cancelled: "Annuler",
                            } as Record<string, string>
                          )[kind]
                        }
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
          <section>
            <h2>Retirer cet appareil</h2>
            <p>
              Synchronisez tous les tickets et faites traiter les conflits. La
              fermeture libère uniquement le stock inutilisé et empêche de
              nouvelles synchronisations sur cet appareil.
            </p>
            <label className="inline">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              J’ai contrôlé toutes les opérations de cet appareil.
            </label>
            <button
              disabled={
                busy ||
                !online ||
                !confirmed ||
                state.events.some((e) =>
                  ["pending", "conflict"].includes(e.state),
                )
              }
              onClick={() =>
                action(async () => {
                  await api({ action: "reconcile", device: state.device });
                  setState(
                    await updateLocal(key, (s) => ({
                      ...s!,
                      closed: true,
                      quotas: [],
                    })),
                  );
                })
              }
            >
              Réconcilier et fermer cet appareil
            </button>
          </section>
        </>
      )}
    </main>
  );
}
