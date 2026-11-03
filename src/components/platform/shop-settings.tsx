"use client";
import { useState } from "react";
import type { Settings } from "@/features/commerce/schema";
const days = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];
export function ShopSettings({
  initial,
  busy,
  save,
}: {
  initial: Settings;
  busy: boolean;
  save: (value: Settings) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <label className="inline">
        <input
          type="checkbox"
          checked={value.open}
          onChange={(e) => setValue({ ...value, open: e.target.checked })}
        />
        Accepter les commandes en ligne
      </label>
      <label>
        Temps de préparation minimal (minutes)
        <input
          type="number"
          min="5"
          max="180"
          value={value.prepMinutes}
          onChange={(e) =>
            setValue({ ...value, prepMinutes: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Intervalle des créneaux (minutes)
        <input
          type="number"
          min="5"
          max="60"
          value={value.interval}
          onChange={(e) =>
            setValue({ ...value, interval: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Commandes par créneau
        <input
          type="number"
          min="1"
          max="100"
          value={value.capacity}
          onChange={(e) =>
            setValue({ ...value, capacity: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Catégories, une par ligne
        <textarea
          value={value.categories.join("\n")}
          onChange={(e) =>
            setValue({ ...value, categories: e.target.value.split("\n") })
          }
        />
      </label>
      <label>
        Adresse de retrait
        <input
          value={value.address}
          onChange={(e) => setValue({ ...value, address: e.target.value })}
        />
      </label>
      <label>
        Téléphone
        <input
          value={value.phone}
          onChange={(e) => setValue({ ...value, phone: e.target.value })}
        />
      </label>
      <h3>Horaires de commande</h3>
      {value.hours.map((h, i) => (
        <article key={i}>
          <label>
            Jour
            <select
              value={h.day}
              onChange={(e) =>
                setValue({
                  ...value,
                  hours: value.hours.map((x, j) =>
                    j === i ? { ...x, day: Number(e.target.value) } : x,
                  ),
                })
              }
            >
              {days.map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ouverture
            <input
              type="time"
              value={h.open}
              onChange={(e) =>
                setValue({
                  ...value,
                  hours: value.hours.map((x, j) =>
                    j === i ? { ...x, open: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <label>
            Fermeture
            <input
              type="time"
              value={h.close}
              onChange={(e) =>
                setValue({
                  ...value,
                  hours: value.hours.map((x, j) =>
                    j === i ? { ...x, close: e.target.value } : x,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setValue({
                ...value,
                hours: value.hours.filter((_, j) => j !== i),
              })
            }
          >
            Retirer cette plage
          </button>
        </article>
      ))}
      <div className="actions">
        <button
          type="button"
          onClick={() =>
            setValue({
              ...value,
              hours: [
                ...value.hours,
                { day: 1, open: "12:00", close: "14:00" },
              ],
            })
          }
        >
          Ajouter une plage
        </button>
        <button disabled={busy}>Enregistrer les réglages</button>
      </div>
    </form>
  );
}
