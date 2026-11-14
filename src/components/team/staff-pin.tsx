"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { KeyRound, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import "./staff-pin.css";

const LAST_OPERATOR = "studio-os.pin.last-operator";
const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 6);

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="staff-pin-field">
      {label}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="\d{4,6}"
        minLength={4}
        maxLength={6}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(digitsOnly(event.target.value))}
      />
    </label>
  );
}

/**
 * Création du code PIN à l’arrivée dans l’espace de travail (ou changement volontaire).
 * Tant qu’il n’est pas créé, l’établissement qui l’exige reste inaccessible.
 */
export function PinSetup({
  restaurant,
  restaurantName,
  userName,
  change = false,
  onDone,
  onCancel,
}: {
  restaurant: string;
  restaurantName: string;
  userName: string;
  change?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState(""),
    [code, setCode] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (code !== confirm) return setError("Les deux codes PIN ne correspondent pas.");
    setBusy(true);
    try {
      const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPin", code, confirm, ...(change ? { current } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Enregistrement impossible.");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="staff-pin-setup">
      <form className="staff-pin-card" onSubmit={submit}>
        <span className="staff-pin-icon"><KeyRound size={26} /></span>
        <h1>{change ? "Changer mon code PIN" : `Bienvenue ${userName}`}</h1>
        <p>
          {change
            ? "Saisissez votre code actuel, puis le nouveau."
            : `Avant d’accéder à ${restaurantName}, créez votre code PIN personnel.`}
        </p>
        <ul className="staff-pin-rules">
          <li>Il identifie la personne qui prend une commande, encaisse ou annule, même sur un appareil partagé.</li>
          <li>Il ne sert pas à se connecter. Ne le communiquez à personne.</li>
          <li>4 à 6 chiffres, sans suite ni chiffres identiques (pas de 1234 ni de 0000).</li>
        </ul>
        {change && <PinField label="Code PIN actuel" value={current} onChange={setCurrent} autoFocus />}
        <PinField label={change ? "Nouveau code PIN" : "Code PIN"} value={code} onChange={setCode} autoFocus={!change} />
        <PinField label="Confirmez le code PIN" value={confirm} onChange={setConfirm} />
        {error && <p role="alert" className="error">{error}</p>}
        <div className="staff-pin-actions">
          {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>}
          <Button disabled={busy || code.length < 4 || confirm.length < 4}>
            {busy ? "Enregistrement…" : "Enregistrer mon code PIN"}
          </Button>
        </div>
      </form>
    </main>
  );
}

/** Fenêtre de validation : la personne choisit son nom et tape son PIN. */
export function PinPrompt({
  title,
  operators,
  defaultOperator,
  onSubmit,
  onCancel,
}: {
  title: string;
  operators: { id: string; name: string }[];
  defaultOperator: string;
  onSubmit: (pin: { profile: string; code: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const remembered = (() => {
    try {
      return localStorage.getItem(LAST_OPERATOR) || "";
    } catch {
      return "";
    }
  })();
  const initial =
    [remembered, defaultOperator].find((id) => operators.some((o) => o.id === id)) ||
    operators[0]?.id ||
    "";
  const [profile, setProfile] = useState(initial),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ profile, code });
      try {
        localStorage.setItem(LAST_OPERATOR, profile);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal staff-pin-prompt">
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label="Fermer"><X /></Dialog.Close>
          </header>
          <Dialog.Description className="muted">
            Cette étape sera enregistrée à votre nom dans l’historique de l’équipe.
          </Dialog.Description>
          {operators.length ? (
            <form onSubmit={submit}>
              <label className="staff-pin-field">
                Qui valide ?
                <select value={profile} onChange={(event) => setProfile(event.target.value)}>
                  {operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>{operator.name}</option>
                  ))}
                </select>
              </label>
              <PinField label="Code PIN" value={code} onChange={setCode} autoFocus />
              {error && <p role="alert" className="error">{error}</p>}
              <div className="staff-pin-actions">
                <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
                <Button disabled={busy || code.length < 4 || !profile}>{busy ? "Vérification…" : "Valider"}</Button>
              </div>
            </form>
          ) : (
            <p role="alert" className="error">
              Aucun membre n’a encore créé son code PIN dans cet établissement.
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
