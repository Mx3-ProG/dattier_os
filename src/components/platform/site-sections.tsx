"use client";
import { useState } from "react";
import type { SiteSection } from "@/features/site/model";
export function SiteSections({
  restaurant,
  sections,
  canLock,
  change,
}: {
  restaurant: string;
  sections: SiteSection[];
  canLock: boolean;
  change: (value: SiteSection[]) => void;
}) {
  const [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  function update(id: string, patch: Partial<SiteSection>) {
    change(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function move(index: number, direction: number) {
    const list = [...sections],
      next = index + direction;
    if (next < 0 || next >= list.length) return;
    [list[index], list[next]] = [list[next], list[index]];
    change(list);
  }
  async function upload(id: string, file: File) {
    setError("");
    setUploading(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("Image limitée à 8 Mo.");
      const r = await fetch(`/api/restaurants/${restaurant}/media`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Import impossible.");
      update(id, { asset: d.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <h3>Sections de la page d’accueil</h3>
      <p>
        Les images deviennent publiques après publication du site. Les verrous
        protègent le contenu ; l’ordre reste modifiable.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {sections.map((section, index) => {
        const locked = section.locked && !canLock;
        return (
          <article key={section.id}>
            <label>
              Type de section
              <select
                disabled={locked}
                value={section.type}
                onChange={(e) =>
                  update(section.id, {
                    type: e.target.value as SiteSection["type"],
                  })
                }
              >
                <option value="text">Texte</option>
                <option value="image">Image et texte</option>
                <option value="catalog">Introduction à la carte</option>
              </select>
            </label>
            <label>
              Titre
              <input
                disabled={locked}
                maxLength={160}
                value={section.title}
                onChange={(e) => update(section.id, { title: e.target.value })}
              />
            </label>
            <label>
              Texte
              <textarea
                disabled={locked}
                maxLength={5000}
                value={section.body}
                onChange={(e) => update(section.id, { body: e.target.value })}
              />
            </label>
            {section.type === "image" && (
              <label>
                Image PNG, JPEG ou WebP
                <input
                  disabled={locked || uploading}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(section.id, file);
                  }}
                />
                {section.asset && (
                  <small>
                    Image importée ; enregistrez le brouillon pour la conserver.
                  </small>
                )}
              </label>
            )}
            <label className="inline">
              <input
                type="checkbox"
                disabled={locked}
                checked={section.visible}
                onChange={(e) =>
                  update(section.id, { visible: e.target.checked })
                }
              />
              Section visible
            </label>
            {canLock && (
              <label className="inline">
                <input
                  type="checkbox"
                  checked={section.locked}
                  onChange={(e) =>
                    update(section.id, { locked: e.target.checked })
                  }
                />
                Verrouiller le contenu pour les autres administrateurs
              </label>
            )}
            <div className="actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Monter
              </button>
              <button
                type="button"
                disabled={index === sections.length - 1}
                onClick={() => move(index, 1)}
              >
                Descendre
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() =>
                  change(sections.filter((s) => s.id !== section.id))
                }
              >
                Retirer du brouillon
              </button>
            </div>
          </article>
        );
      })}
      <button
        type="button"
        disabled={sections.length >= 30}
        onClick={() =>
          change([
            ...sections,
            {
              id: crypto.randomUUID(),
              type: "text",
              title: "Nouvelle section",
              body: "",
              visible: true,
              locked: false,
            },
          ])
        }
      >
        Ajouter une section
      </button>
    </div>
  );
}
