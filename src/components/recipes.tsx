"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import { can } from "@/lib/permissions";
import { money } from "@/lib/domain";
import { Form, Modal, type Act } from "./forms";
import { Button } from "./ui/button";
export function Recipes({
  data,
  act,
  query,
}: {
  data: Snapshot;
  act: Act;
  query: string;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <>
      <h2>Le juste équilibre, ingrédient par ingrédient.</h2>
      <p className="muted">
        Compositions de démonstration · allergènes non validés.
      </p>
      <div className="three-grid">
        {data.menu
          .filter(
            (m) =>
              !m.archived_at &&
              m.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((m) => (
            <article className="card recipe-card" key={m.id}>
              <span className="eyebrow">{m.category}</span>
              <h3>{m.name}</h3>
              <div className="between">
                <b>{money(m.price)}</b>
                <span className="badge">{m.portions} portions</span>
              </div>
              <ul>
                {data.recipes
                  .filter((l) => l.menu_id === m.id)
                  .map((l) => (
                    <li key={l.ingredient_id}>
                      {l.name}
                      <b>
                        {l.quantity} {l.unit}
                      </b>
                    </li>
                  ))}
              </ul>
              {m.cost !== undefined && (
                <p className="muted">
                  Coût matière estimé : {money(m.cost * 100)}
                  <br />
                  Écart brut prix/coût : {money(m.price - m.cost * 100)} · base
                  fiscale non validée
                </p>
              )}
              {can(data.user, "catalog") && (
                <Button variant="secondary" onClick={() => setEdit(m.id)}>
                  Modifier la recette
                </Button>
              )}
            </article>
          ))}
      </div>
      {edit && (
        <Modal
          title="Modifier un ingrédient de recette"
          close={() => setEdit(null)}
        >
          <Form
            fields={[
              {
                name: "ingredient",
                label: "Ingrédient",
                options: data.ingredients.map((i) => ({
                  value: i.id,
                  label: `${i.name} (${i.unit})`,
                })),
              },
              {
                name: "quantity",
                label: "Quantité par portion (unité de référence)",
                type: "number",
                min: 0.001,
                step: "any",
              },
            ]}
            onSubmit={async (v) => {
              await act({ action: "recipe", menu: edit, ...v });
              setEdit(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
