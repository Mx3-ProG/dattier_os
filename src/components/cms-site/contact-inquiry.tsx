"use client";
import { useState, type FormEvent } from "react";
import { useTenantSite } from "./context";

export function ContactInquiry({ collection = false }: { collection?: boolean }) {
  const { restaurant } = useTenantSite();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = collection ? {
      name: `${values.firstName ?? ""} ${values.lastName ?? ""}`.trim(),
      email: values.email,
      subject: values.subject || "Demande de contact automobile",
      message: `${values.message ?? ""}${values.phone ? `\n\nTéléphone : ${values.phone}` : ""}`,
      website: values.website,
    } : values;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(restaurant)}/crm-inquiry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("Votre demande n’a pas pu être envoyée. Réessayez plus tard.");
      form.reset(); setStatus("Votre demande a bien été envoyée.");
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="donut-section" aria-label="Demande de contact">
    <h2>Écrivez-nous</h2>
    <form onSubmit={(event) => void submit(event)}>
      {collection ? <>
        <label>Prénom <input name="firstName" required maxLength={80} /></label>
        <label>Nom <input name="lastName" required maxLength={80} /></label>
      </> : <label>Nom <input name="name" required maxLength={180} /></label>}
      <label>E-mail <input name="email" type="email" required maxLength={320} /></label>
      {collection && <label>Téléphone <input name="phone" type="tel" maxLength={40} /></label>}
      <label>Objet <input name="subject" required={!collection} maxLength={180} /></label>
      <label>Votre demande <textarea name="message" required maxLength={5000} /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px" }} />
      <button className="donut-button" disabled={busy}>Envoyer</button>
    </form>
    {status && <p role="status">{status}</p>}
  </section>;
}
