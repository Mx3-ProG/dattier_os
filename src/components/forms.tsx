"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
export type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: { value: string; label: string }[];
  min?: number;
  step?: string;
  required?: boolean;
};
export function Form({
  fields,
  onSubmit,
  label = "Enregistrer",
}: {
  fields: Field[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const values = Object.fromEntries(
          new FormData(e.currentTarget),
        ) as Record<string, string>;
        setBusy(true);
        setError("");
        try {
          await onSubmit(values);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.options ? (
            <select
              aria-label={f.label}
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={f.label}
              name={f.name}
              type={f.type || "text"}
              defaultValue={f.value}
              min={f.min}
              step={f.step}
              required={f.required !== false}
            />
          )}
        </label>
      ))}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <Button disabled={busy}>{busy ? "Enregistrement…" : label}</Button>
    </form>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal">
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label="Fermer">
              <X />
            </Dialog.Close>
          </header>
          <Dialog.Description className="muted">
            Données de démonstration · les modifications sont partagées avec
            votre équipe.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export type Act = (a: Record<string, unknown>) => Promise<void>;
export const statusLabels: Record<string, string> = {
  free: "Libre",
  occupied: "Occupée",
  cleaning: "À nettoyer",
  unavailable: "Indisponible",
  waiting: "À préparer",
  preparing: "En préparation",
  ready: "Prêt",
  served: "Servi",
  cancelled: "Annulé",
  active: "En cours",
  paid: "Réglée",
  pending: "À confirmer",
  requested: "Demandée",
  confirmed: "Confirmée",
  arrived: "Arrivé",
  declined: "Refusée",
  no_show: "Absent",
  partial: "Partiellement reçue",
  received: "Reçue",
};
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>{statusLabels[status] || status}</span>
  );
}
