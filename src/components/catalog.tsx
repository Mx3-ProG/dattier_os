"use client";
import { useState } from "react";
import { Plus, Archive, Trash2, RotateCcw } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { money } from "@/lib/domain";
import { Button } from "./ui/button";
import { Form, Modal, type Act, type Field } from "./forms";
const fields: Field[] = [
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
    label: "Description de démonstration",
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
  const product = data.menu.find((m) => m.id === edit);
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
                label: "Description",
                value: product.description,
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
