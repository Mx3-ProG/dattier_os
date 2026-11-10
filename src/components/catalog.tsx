"use client";
import { useState } from "react";
import { Plus, Archive, Trash2, RotateCcw, Zap } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { money } from "@/lib/domain";
import { Button } from "./ui/button";
import { Form, Modal, type Act, type Field } from "./forms";
const defaultFields: Field[] = [
  { name: "name", label: "Nom du produit" },
  {
    name: "category",
    label: "Catégorie",
    options: ["Entrées", "Plats", "Desserts", "Boissons"].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    name: "price",
    label: "Prix de vente (€)",
    type: "number",
    min: 0,
    step: "0.01",
  },
  {
    name: "station",
    label: "Préparation",
    options: [
      { value: "kitchen", label: "Cuisine" },
      { value: "bar", label: "Bar" },
    ],
  },
  {
    name: "description",
    label: "Description",
    required: false,
  },
];
export function Catalog({ data, act }: { data: Snapshot; act: Act }) {
  const [mode, setMode] = useState("active"),
    [query, setQuery] = useState(""),
    [create, setCreate] = useState(false),
    [edit, setEdit] = useState<string | null>(null),
    [lines, setLines] = useState([
      { id: data.ingredients[0]?.id || "", quantity: "1" },
    ]);
  const fields = defaultFields.map((field) =>
    field.name === "category"
      ? {
          ...field,
          options: data.categories.map((value) => ({ value, label: value })),
        }
      : field,
  );
  const product = data.menu.find((m) => m.id === edit);
  const [flashFor, setFlashFor] = useState<string | null>(null);
  const flashProduct = data.menu.find((m) => m.id === flashFor);
  const flashOf = (id: string) =>
    data.flashPromotions.find((f) => f.menu_id === id);
  const localNow = () => {
    const now = new Date(data.now);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const when = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  const [error, setError] = useState("");
  async function change(id: string, operation: string) {
    try {
      await act({ action: "productLifecycle", id, operation });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Une carte, partout à jour.</h2>
          <p>
            Créez un produit avec sa recette pour le rendre immédiatement
            commandable.
          </p>
        </div>
        <Button
          onClick={() => {
            setLines([{ id: data.ingredients[0]?.id || "", quantity: "1" }]);
            setCreate(true);
          }}
        >
          <Plus size={17} />
          Ajouter un produit
        </Button>
      </div>
      {data.flashPromotions.length > 0 && (
        <section className="card flash-admin">
          <span className="eyebrow">
            <Zap size={14} /> Promotions flash
          </span>
          <ul>
            {data.flashPromotions.map((f) => {
              const live = Date.parse(f.starts_at) <= Date.parse(data.now);
              return (
                <li key={f.id} className="between">
                  <span>
                    <b>{f.menu_name}</b> ·{" "}
                    {f.kind === "percent"
                      ? `−${f.value} %`
                      : `${money(f.value)} au lieu de ${money(f.regular_price)}`}
                    {f.member_bonus_points
                      ? ` · +${f.member_bonus_points} pts membre`
                      : ""}
                    <br />
                    <small className="muted">
                      {live ? "En cours" : `Dès ${when(f.starts_at)}`} ·
                      jusqu’au {when(f.ends_at)}
                    </small>
                  </span>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await act({ action: "stopFlashPromotion", id: f.id });
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Arrêter
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="tabs">
        <button
          className={mode === "active" ? "active" : ""}
          onClick={() => setMode("active")}
        >
          Produits actifs
        </button>
        <button
          className={mode === "archived" ? "active" : ""}
          onClick={() => setMode("archived")}
        >
          Archives ({data.menu.filter((m) => m.archived_at).length})
        </button>
      </div>
      <input
        className="module-search"
        placeholder="Rechercher un produit…"
        aria-label="Rechercher un produit"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="three-grid">
        {data.menu
          .filter(
            (m) =>
              (mode === "archived" ? !!m.archived_at : !m.archived_at) &&
              m.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((m) => (
            <article className="card recipe-card" key={m.id}>
              <span className="eyebrow">
                {m.category} · {m.station === "bar" ? "Bar" : "Cuisine"}
              </span>
              <h3>{m.name}</h3>
              <div className="between">
                <b>{money(m.price)}</b>
                <span className="badge">
                  {m.archived_at
                    ? "Archivé"
                    : !m.enabled
                      ? "Désactivé"
                      : `${m.portions} portions`}
                </span>
              </div>
              <p className="muted">{m.description}</p>
              <Button variant="secondary" onClick={() => setEdit(m.id)}>
                Modifier le produit
              </Button>
              {!m.archived_at && data.plan >= 39 && (
                <Button variant="ghost" onClick={() => setFlashFor(m.id)}>
                  <Zap size={15} />
                  {flashOf(m.id) ? "Promo flash programmée" : "Promo flash"}
                </Button>
              )}
              <div className="actions">
                {m.archived_at ? (
                  <Button
                    variant="ghost"
                    onClick={() => change(m.id, "restore")}
                  >
                    <RotateCcw size={15} />
                    Restaurer
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (
                        confirm(
                          `Archiver « ${m.name} » ? Il disparaîtra de la vente, l’historique restera conservé.`,
                        )
                      )
                        void change(m.id, "archive");
                    }}
                  >
                    <Archive size={15} />
                    Archiver
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => {
                    if (
                      confirm(
                        `Supprimer définitivement « ${m.name} » et sa recette ? Cette action est possible uniquement si ce produit n’a jamais été commandé.`,
                      )
                    )
                      void change(m.id, "delete");
                  }}
                >
                  <Trash2 size={15} />
                  Supprimer
                </Button>
              </div>
            </article>
          ))}
      </div>
      {flashProduct && (
        <Modal
          title={`Promo flash · ${flashProduct.name}`}
          close={() => setFlashFor(null)}
        >
          <p className="muted">
            Le prix réduit s’affiche sur le site, dans l’espace client avec un
            compte à rebours, et s’applique automatiquement au panier. Prix
            habituel : {money(flashProduct.price)}.
          </p>
          <Form
            label="Lancer la promo flash"
            fields={[
              {
                name: "kind",
                label: "Type de promotion",
                options: [
                  { value: "percent", label: "Remise en pourcentage" },
                  { value: "price", label: "Prix flash (€)" },
                ],
              },
              {
                name: "value",
                label: "Remise (%) ou prix flash (€)",
                type: "number",
                min: 0.01,
                step: "0.01",
                value: 20,
              },
              {
                name: "start",
                label: "Début",
                type: "datetime-local",
                value: localNow(),
              },
              {
                name: "hours",
                label: "Durée (heures)",
                type: "number",
                min: 1,
                value: 3,
              },
              {
                name: "bonus",
                label: "Bonus points pour les clients connectés (par article)",
                type: "number",
                min: 0,
                value: 10,
              },
            ]}
            onSubmit={async (v) => {
              const start = new Date(v.start);
              const end = new Date(
                start.getTime() + Number(v.hours) * 3600000,
              );
              await act({
                action: "flashPromotion",
                menu: flashProduct.id,
                kind: v.kind,
                value:
                  v.kind === "price"
                    ? Math.round(Number(v.value) * 100)
                    : Math.round(Number(v.value)),
                starts_at: start.toISOString(),
                ends_at: end.toISOString(),
                member_bonus_points: Number(v.bonus) || 0,
              });
              setFlashFor(null);
            }}
          />
        </Modal>
      )}
      {create && (
        <Modal title="Ajouter un produit" close={() => setCreate(false)}>
          <h3>Recette · quantités par portion</h3>
          <p className="muted">
            Au moins un ingrédient est requis. Les quantités utilisent l’unité
            de stock indiquée.
          </p>
          {lines.map((line, i) => (
            <div className="recipe-line" key={i}>
              <label>
                Ingrédient
                <select
                  aria-label={`Ingrédient ${i + 1}`}
                  value={line.id}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        j === i ? { ...l, id: e.target.value } : l,
                      ),
                    )
                  }
                >
                  {data.ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantité
                <input
                  aria-label={`Quantité ${i + 1}`}
                  type="number"
                  min="0.001"
                  step="any"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        j === i ? { ...l, quantity: e.target.value } : l,
                      ),
                    )
                  }
                />
              </label>
              <Button
                variant="ghost"
                disabled={lines.length === 1}
                aria-label={`Retirer l’ingrédient ${i + 1}`}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setLines([
                ...lines,
                { id: data.ingredients[0]?.id || "", quantity: "1" },
              ])
            }
          >
            Ajouter un ingrédient
          </Button>
          <Form
            fields={fields}
            label="Créer le produit"
            onSubmit={async (v) => {
              await act({
                action: "createProduct",
                ...v,
                price: Math.round(Number(v.price) * 100),
                ingredients: lines.map((l) => ({
                  id: l.id,
                  quantity: Number(l.quantity),
                })),
              });
              setCreate(false);
            }}
          />
        </Modal>
      )}
      {product && (
        <Modal title="Modifier le produit" close={() => setEdit(null)}>
          <p>
            La description, la composition et les allergènes s’affichent sur la
            fiche publique. Vérifiez la recette, les sauces et les garnitures
            avant de les renseigner.
          </p>
          <Form
            fields={[
              { name: "name", label: "Nom", value: product.name },
              {
                name: "price",
                label: "Prix (€)",
                type: "number",
                step: "0.01",
                min: 0,
                value: product.price / 100,
              },
              {
                name: "description",
                label: "Description publique",
                value: product.description,
                type: "textarea",
                maxLength: 500,
                required: false,
              },
              {
                name: "public_composition",
                label: "Composition exacte du plat servi",
                value: product.public_composition,
                type: "textarea",
                maxLength: 2000,
                required: false,
              },
              {
                name: "allergens",
                label: "Allergènes et traces éventuelles vérifiés",
                value: product.allergens,
                type: "textarea",
                maxLength: 500,
                required: false,
              },
              {
                name: "seo_title",
                label: "Titre SEO",
                value: product.seo_title,
                maxLength: 80,
                required: false,
              },
              {
                name: "seo_description",
                label: "Description SEO",
                value: product.seo_description,
                type: "textarea",
                maxLength: 200,
                required: false,
              },
              {
                name: "enabled",
                label: "Disponible à la vente",
                value: String(product.enabled),
                options: [
                  { value: "true", label: "Oui" },
                  { value: "false", label: "Non" },
                ],
              },
            ]}
            onSubmit={async (v) => {
              await act({
                action: "menu",
                id: product.id,
                ...v,
                price: Math.round(Number(v.price) * 100),
                enabled: v.enabled === "true",
              });
              setEdit(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
