"use client";
import { can } from "@/lib/permissions";
import { useState } from "react";
import {
  Plus,
  Minus,
  UtensilsCrossed,
  Clock,
  Users,
  Check,
  ChefHat,
  Wine,
} from "lucide-react";
import type { Snapshot, Table, MenuItem } from "@/lib/types";
import { money, dateTime } from "@/lib/domain";
import { Button } from "./ui/button";
import { Badge, Form, Modal, type Act } from "./forms";
export function Composer({
  data,
  table,
  act,
  close,
}: {
  data: Snapshot;
  table: Table;
  act: Act;
  close: () => void;
}) {
  const [cart, setCart] = useState<Record<string, number>>({}),
    [category, setCategory] = useState(
      data.user.role === "BARTENDER" ? "Boissons" : "Plats",
    ),
    [query, setQuery] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const menu = data.menu.filter((m) => m.enabled && !m.archived_at);
  function add(m: MenuItem, n: number) {
    setCart((c) => ({
      ...c,
      [m.id]: Math.min(m.portions, 50, Math.max(0, (c[m.id] || 0) + n)),
    }));
  }
  const total = menu.reduce((s, m) => s + (cart[m.id] || 0) * m.price, 0);
  return (
    <Modal title={`Commande · Table ${table.number}`} close={close}>
      <input
        className="search"
        aria-label="Rechercher un produit"
        placeholder="Rechercher un plat ou une boisson…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="tabs">
        {["Entrées", "Plats", "Desserts", "Boissons"].map((c) => (
          <button
            className={category === c ? "active" : ""}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="menu-list">
        {menu
          .filter(
            (m) =>
              m.category === category &&
              m.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((m) => (
            <div className="menu-row" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <small>
                  {money(m.price)} · {m.portions} portions disponibles
                </small>
              </div>
              <div className="stepper">
                <button
                  aria-label={`Retirer ${m.name}`}
                  onClick={() => add(m, -1)}
                  disabled={!cart[m.id]}
                >
                  <Minus size={16} />
                </button>
                <b>{cart[m.id] || 0}</b>
                <button
                  aria-label={`Ajouter ${m.name}`}
                  disabled={m.portions < 1 || (cart[m.id] || 0) >= m.portions}
                  onClick={() => add(m, 1)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          ))}
      </div>
      <label>
        Instructions de préparation
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Sans raisins, à partager…"
          maxLength={300}
        />
      </label>
      <div className="cart-summary">
        {menu
          .filter((m) => cart[m.id] > 0)
          .map((m) => (
            <span key={m.id}>
              {cart[m.id]} × {m.name}
            </span>
          ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button
        disabled={!total || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await act({
              action: "order",
              data: {
                restaurant: data.restaurant.id,
                table: table.id,
                channel: "staff",
                key,
                items: Object.entries(cart)
                  .filter(([, q]) => q > 0)
                  .map(([menu, quantity]) => ({ menu, quantity, note })),
              },
            });
            close();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <UtensilsCrossed size={17} /> Envoyer en préparation · {money(total)}
      </Button>
    </Modal>
  );
}
export function Dining({ data, act }: { data: Snapshot; act: Act }) {
  const [selected, setSelected] = useState<Table | null>(null);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>La salle, en un regard</h2>
          <p>Ouvrez une table pour prendre une commande.</p>
        </div>
        <span className="pill">
          <span className="dot" />
          {data.tables.filter((t) => t.status === "occupied").length} tables en
          service
        </span>
      </div>
      <div className="legend">
        {["free", "occupied", "cleaning", "unavailable"].map((s) => (
          <Badge key={s} status={s} />
        ))}
      </div>
      <div className="floor">
        <span className="floor-label">SALLE PRINCIPALE</span>
        <div className="table-grid">
          {data.tables.map((t) => (
            <div className={`table-wrap ${t.status}`} key={t.id}>
              <button
                className="dining-table"
                disabled={["cleaning", "unavailable"].includes(t.status)}
                onClick={() => setSelected(t)}
              >
                <span className="table-number">
                  {String(t.number).padStart(2, "0")}
                </span>
                <span>
                  <Users size={13} /> {t.capacity} places
                </span>
                <Badge status={t.status} />
                {data.reservations.some(
                  (r) => r.table_id === t.id && r.status === "confirmed",
                ) && <small>Réservation prévue</small>}
              </button>
              {t.status === "cleaning" || t.status === "unavailable" ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    act({ action: "table", id: t.id, status: "free" })
                  }
                >
                  Marquer libre
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <span className="floor-label bottom">ENTRÉE · TERRASSE</span>
      </div>
      {selected && (
        <Composer
          data={data}
          table={selected}
          act={act}
          close={() => setSelected(null)}
        />
      )}
      <OrderList data={data} act={act} compact />
    </>
  );
}
export function OrderList({
  data,
  act,
  compact = false,
}: {
  data: Snapshot;
  act: Act;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState("active"),
    [payment, setPayment] = useState<string | null>(null);
  const filtered = data.orders.filter((o) =>
    compact
      ? ["active", "pending"].includes(o.status)
      : filter === "all" || o.status === filter,
  );
  return (
    <>
      <div className="section-heading">
        <h2>{compact ? "Le service en cours" : "Suivi des commandes"}</h2>
        {!compact && (
          <select
            aria-label="Filtrer les commandes"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">En cours</option>
            <option value="pending">À confirmer</option>
            <option value="paid">Réglées</option>
            <option value="all">Toutes</option>
          </select>
        )}
      </div>
      <div className="order-grid">
        {filtered.length === 0 && (
          <div className="empty">
            <UtensilsCrossed />
            <h3>Aucune commande ici</h3>
            <p>Les nouvelles commandes apparaîtront automatiquement.</p>
          </div>
        )}
        {filtered.map((o) => (
          <article className="card order-card" key={o.id}>
            <header>
              <div>
                <small>#{o.id.slice(0, 6)}</small>
                <h3>
                  {o.table_number ? `Table ${o.table_number}` : "À emporter"}
                </h3>
              </div>
              <Badge status={o.status} />
            </header>
            <small>
              <Clock size={13} /> {dateTime(o.created_at)} ·{" "}
              {o.channel === "staff"
                ? "Salle"
                : o.channel === "qr"
                  ? "QR table"
                  : "Site public"}
            </small>
            {o.customer_name && (
              <p>
                {o.customer_name} · {o.contact}
              </p>
            )}
            <div className="order-items">
              {o.items.map((i) => (
                <div key={i.id}>
                  <div>
                    <b>
                      {i.quantity} × {i.name}
                    </b>
                    <small>{i.note}</small>
                    <Badge status={i.status} />
                  </div>
                  <div className="item-actions">
                    {i.status === "ready" && o.status === "active" && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          act({ action: "item", id: i.id, status: "served" })
                        }
                      >
                        Servir
                      </Button>
                    )}
                    {!["served", "cancelled"].includes(i.status) &&
                      o.status === "active" && (
                        <button
                          className="text-button"
                          onClick={() => {
                            if (
                              confirm(
                                "Annuler ce produit ? Les ingrédients déjà consommés seront comptés en perte.",
                              )
                            )
                              void act({
                                action: "item",
                                id: i.id,
                                status: "cancelled",
                              });
                          }}
                        >
                          Annuler
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
            {o.payment_amount !== null && o.payment_amount !== undefined && (
              <p className="note">
                Règlement déclaré {o.session_id ? "de la table" : ""} :{" "}
                {money(o.payment_amount)} · remise : {money(o.discount ?? 0)}
              </p>
            )}
            <footer>
              <strong>
                {money(
                  o.items
                    .filter((i) => i.status !== "cancelled")
                    .reduce((s, i) => s + i.price * i.quantity, 0),
                )}
              </strong>
              {o.status === "active" && can(data.user, "payments") && (
                <Button variant="secondary" onClick={() => setPayment(o.id)}>
                  Clôturer / déclarer le règlement
                </Button>
              )}
              {o.status === "pending" && (
                <div className="actions">
                  <Button
                    onClick={() =>
                      act({ action: "confirmOrder", id: o.id, accept: true })
                    }
                  >
                    Accepter
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      act({ action: "confirmOrder", id: o.id, accept: false })
                    }
                  >
                    Refuser
                  </Button>
                </div>
              )}
            </footer>
          </article>
        ))}
      </div>
      {payment && (
        <Modal title="Déclarer le règlement" close={() => setPayment(null)}>
          <p>
            Cette opération clôture toutes les commandes de la session de table.
            Aucun encaissement réel n’est effectué.
          </p>
          <Form
            fields={[
              {
                name: "customer",
                label: "Client titulaire (facultatif sans code)",
                required: false,
                options: [
                  { value: "", label: "Sans client" },
                  ...data.checkoutCustomers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ],
              },
              {
                name: "promo",
                label: "Code promo personnel (facultatif)",
                required: false,
              },
              {
                name: "method",
                label: "Moyen de paiement déclaré",
                options: [
                  { value: "card", label: "Carte bancaire" },
                  { value: "cash", label: "Espèces" },
                  { value: "other", label: "Autre" },
                ],
              },
            ]}
            label="Confirmer le règlement déclaré"
            onSubmit={async (v) => {
              await act({
                action: "pay",
                id: payment,
                method: v.method,
                customer: v.customer || undefined,
                promo: v.promo || undefined,
              });
              setPayment(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function Kds({
  data,
  station,
  act,
}: {
  data: Snapshot;
  station: "kitchen" | "bar";
  act: Act;
}) {
  const [showDone, setShowDone] = useState(false);
  const [choosing, setChoosing] = useState(false),
    [table, setTable] = useState<Table | null>(null);
  const orders = data.orders.filter(
    (o) =>
      o.status === "active" &&
      o.items.some(
        (i) =>
          i.station === station &&
          (showDone || !["served", "cancelled"].includes(i.status)),
      ),
  );
  return (
    <>
      {table && (
        <Composer
          data={data}
          table={table}
          act={act}
          close={() => setTable(null)}
        />
      )}
      {choosing && (
        <Modal
          title="Nouvelle commande · choisir une table"
          close={() => setChoosing(false)}
        >
          <div className="three-grid">
            {data.tables
              .filter((t) => ["free", "occupied"].includes(t.status))
              .map((t) => (
                <Button
                  key={t.id}
                  variant="secondary"
                  onClick={() => {
                    setTable(t);
                    setChoosing(false);
                  }}
                >
                  Table {t.number}
                </Button>
              ))}
          </div>
        </Modal>
      )}
      <div className="actions">
        <Button onClick={() => setChoosing(true)}>Nouvelle commande</Button>
      </div>
      <div className="section-heading">
        <div>
          <h2>
            {station === "kitchen"
              ? "Le coup de feu, sous contrôle."
              : "Chaque boisson à son rythme."}
          </h2>
          <p>Les commandes se synchronisent toutes les 3 secondes.</p>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />{" "}
          Voir les produits servis
        </label>
      </div>
      <div className="kds-grid">
        {orders.length === 0 && (
          <div className="empty">
            <Check />
            <h3>Tout est à jour</h3>
            <p>Les prochaines préparations arriveront ici.</p>
          </div>
        )}
        {orders.map((o) => (
          <article className="card kds-card" key={o.id}>
            <header>
              <div className="station-icon">
                {station === "kitchen" ? <ChefHat /> : <Wine />}
              </div>
              <div>
                <h2>
                  {o.table_number ? `Table ${o.table_number}` : "À emporter"}
                </h2>
                <small>
                  #{o.id.slice(0, 6)} ·{" "}
                  {Math.max(
                    0,
                    Math.floor(
                      (new Date(data.now).getTime() -
                        new Date(o.created_at).getTime()) /
                        60000,
                    ),
                  )}{" "}
                  min
                </small>
              </div>
            </header>
            {o.items
              .filter(
                (i) =>
                  i.station === station &&
                  (showDone || !["served", "cancelled"].includes(i.status)),
              )
              .map((i) => (
                <div className="prep-item" key={i.id}>
                  <h3>
                    {i.quantity} × {i.name}
                  </h3>
                  {i.note && <p className="note">{i.note}</p>}
                  <Badge status={i.status} />
                  {["waiting", "preparing"].includes(i.status) && (
                    <Button
                      onClick={() =>
                        act({
                          action: "item",
                          id: i.id,
                          status:
                            i.status === "waiting" ? "preparing" : "ready",
                        })
                      }
                    >
                      {i.status === "waiting" ? "Commencer" : "Marquer prêt"}
                    </Button>
                  )}
                </div>
              ))}
          </article>
        ))}
      </div>
    </>
  );
}
