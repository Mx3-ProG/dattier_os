"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EmailState } from "@/features/email/service";
import type { TemplateView } from "@/features/email/branding/service";
import { brandPresets, emailFonts, type EmailBrand, type EmailFont } from "@/features/email/branding/brand";
import { renderEmail } from "@/features/email/branding/render";
import { customVariables, emailTriggers, exampleVars, type TemplateContent, type TemplateVariable } from "@/features/email/branding/templates";
import type { TransportView } from "@/features/email/smtp/config";
import "./email-center.css";

/**
 * Écran de l'add-on « Emails automatiques ». L'aperçu utilise le même moteur de rendu
 * que l'envoi réel (src/features/email/branding/render.ts) : ce qui est affiché ici est
 * exactement ce que reçoit le client.
 */
type Result = { testId?: string; queued?: number; test?: { status: string; error?: string } };
type Data = EmailState & { result?: Result };
type Tab = "send" | "automations" | "templates" | "brand" | "smtp";

const UNSUBSCRIBE = "Vous ne souhaitez plus recevoir nos offres ? Répondez simplement à ce message.";
const statusLabels: Record<string, string> = {
  queued: "En file", sending: "Envoi…", sent: "Envoyé", demo: "Simulé (démo)", error: "Échec", skipped: "Ignoré",
};
const originLabels: Record<string, string> = { automation: "Automatique", manual: "Manuel", test: "Test" };

async function request(url: string, body?: unknown): Promise<Data> {
  const response = await fetch(url, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Opération indisponible.");
  return result as Data;
}

const variablesOf = (key: string): TemplateVariable[] =>
  emailTriggers.find((trigger) => trigger.key === key)?.variables ?? customVariables;

function Preview({ brand, content, variables, restaurant, marketing }: {
  brand: EmailBrand; content: TemplateContent; variables: TemplateVariable[]; restaurant: string; marketing: boolean;
}) {
  const rendered = useMemo(
    () => renderEmail(brand, content, exampleVars(variables, restaurant), { restaurant, unsubscribe: marketing ? UNSUBSCRIBE : undefined }),
    [brand, content, variables, restaurant, marketing],
  );
  const sender = brand.senderName || restaurant;
  return <figure className="email-preview">
    <figcaption>
      <span className="email-preview-avatar" style={{ background: brand.primary, color: brand.buttonText }}>{sender.slice(0, 1).toUpperCase()}</span>
      <span><strong>{sender}</strong><small>{rendered.subject}</small></span>
    </figcaption>
    <iframe title="Aperçu de l’email" sandbox="" srcDoc={rendered.html} />
    {brand.logoUrl && !brand.logoUrl.startsWith(typeof window === "undefined" ? "" : window.location.origin) &&
      <small className="email-hint">Le logo hébergé ailleurs s’affiche dans l’email reçu, pas dans cet aperçu.</small>}
  </figure>;
}

function ContentFields({ content, onChange, variables }: {
  content: TemplateContent; onChange: (content: TemplateContent) => void; variables: TemplateVariable[];
}) {
  const field = (key: keyof TemplateContent) => ({
    value: content[key],
    onChange: (event: { target: { value: string } }) => onChange({ ...content, [key]: event.target.value }),
  });
  return <div className="email-fields">
    <label>Objet<input maxLength={150} required {...field("subject")} /></label>
    <label>Texte d’aperçu <small>affiché après l’objet dans la boîte de réception</small><input maxLength={150} {...field("preheader")} /></label>
    <label>Titre<input maxLength={150} {...field("heading")} /></label>
    <label>Message<textarea rows={9} maxLength={5000} required {...field("body")} /></label>
    <div className="email-row">
      <label>Bouton (facultatif)<input maxLength={60} placeholder="Réserver à nouveau" {...field("buttonLabel")} /></label>
      <label>Lien du bouton<input maxLength={500} placeholder="https://" {...field("buttonUrl")} /></label>
    </div>
    <p className="email-hint">Variables : {variables.map((variable) => <code key={variable.key} title={variable.label}>{`{{${variable.key}}}`}</code>)} · **gras** · ligne commençant par « - » pour une liste.</p>
  </div>;
}

export function EmailCenter({ restaurant, onOpenStore }: { restaurant: string; onOpenStore?: () => void }) {
  const url = `/api/restaurants/${encodeURIComponent(restaurant)}/emails`;
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("send");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    request(url).then((value) => { if (alive) setData(value); }).catch((cause) => { if (alive) setError((cause as Error).message); });
    return () => { alive = false; };
  }, [url]);

  const run = useCallback(async (body: unknown, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await request(url, body);
      setData(next);
      const test = next.result?.test;
      setNotice(test
        ? test.status === "sent" ? "Email de test envoyé : vérifiez votre boîte de réception."
          : test.status === "demo" ? "Test simulé : aucun SMTP réel n’est actif ici, l’email a été rendu et tracé."
            : `Le test a échoué : ${test.error ?? "erreur inconnue"}`
        : next.result?.queued ? `${next.result.queued} email(s) en cours d’envoi.` : success);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [url]);

  if (!data) return <section className="email-center"><p role={error ? "alert" : "status"}>{error || "Chargement des emails…"}</p>
    {error && onOpenStore && <Button onClick={onOpenStore}>Voir les add-ons</Button>}</section>;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "send", label: "Envois", show: true },
    { id: "automations", label: "Automatisations", show: data.rights.canSend },
    { id: "templates", label: "Modèles", show: data.rights.canSend },
    { id: "brand", label: "Identité visuelle", show: data.rights.canConfigure },
    { id: "smtp", label: "Expédition (SMTP)", show: data.rights.canConfigure },
  ];
  const props = { data, busy, run };
  return <section className="email-center">
    <header className="email-head">
      <div>
        <p>Des emails à vos couleurs, envoyés automatiquement ou à la main. {data.transport.mode === "custom"
          ? <>Expédition par <strong>{data.transport.host}</strong>.</>
          : <>Expédition par le SMTP de la plateforme{data.platform.configured ? "" : " (non actif dans cet environnement : envois simulés)"}.</>}</p>
      </div>
      <dl className="email-stats">
        <div><dt>Envoyés (30 j)</dt><dd>{data.stats.sent}</dd></div>
        <div><dt>Échecs</dt><dd>{data.stats.failed}</dd></div>
        <div><dt>En file</dt><dd>{data.stats.queued}</dd></div>
        <div><dt>Aujourd’hui</dt><dd>{data.stats.today}<small>/{data.dailyLimit}</small></dd></div>
      </dl>
    </header>
    <nav className="email-tabs" role="tablist" aria-label="Sections des emails">
      {tabs.filter((entry) => entry.show).map((entry) => <button key={entry.id} role="tab" aria-selected={tab === entry.id} className={tab === entry.id ? "active" : ""} onClick={() => { setTab(entry.id); setNotice(""); setError(""); }}>{entry.label}</button>)}
    </nav>
    {error && <p className="email-alert" role="alert">{error}</p>}
    {notice && <p className="email-notice" role="status">{notice}</p>}
    {tab === "send" && <SendTab {...props} />}
    {tab === "automations" && <AutomationsTab {...props} onEdit={() => setTab("templates")} />}
    {tab === "templates" && <TemplatesTab {...props} />}
    {tab === "brand" && <BrandTab {...props} />}
    {tab === "smtp" && <SmtpTab {...props} />}
  </section>;
}

type TabProps = { data: Data; busy: boolean; run: (body: unknown, success: string) => Promise<boolean> };

function SendTab({ data, busy, run }: TabProps) {
  const sendable = data.templates;
  const [key, setKey] = useState(sendable.find((template) => !template.automatic)?.key ?? sendable[0]?.key ?? "");
  const template = sendable.find((entry) => entry.key === key);
  const [content, setContent] = useState<TemplateContent | null>(template?.content ?? null);
  const [audience, setAudience] = useState<"consenting" | "customers">("consenting");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [testEmail, setTestEmail] = useState("");
  useEffect(() => { setContent(template?.content ?? null); }, [template]);
  const marketing = template?.category === "marketing";
  const people = data.audience.filter((person) => !search || `${person.name} ${person.email}`.toLowerCase().includes(search.toLowerCase()));
  const reach = audience === "consenting"
    ? data.audience.filter((person) => person.consent).length
    : data.audience.filter((person) => selected.includes(person.id) && (!marketing || person.consent)).length;
  return <div className="email-grid">
    {data.rights.canSend && template && content && <div className="email-panel">
      <h2>Nouvel envoi</h2>
      <label>Modèle<select value={key} onChange={(event) => setKey(event.target.value)}>
        {sendable.map((entry) => <option key={entry.key} value={entry.key}>{entry.automatic ? "Automatique · " : ""}{entry.name}</option>)}
      </select></label>
      <p className="email-hint">{marketing ? "Message commercial : seuls les clients qui ont accepté vos offres le recevront, avec la mention de désinscription." : "Message d’information : envoyé à tous les destinataires choisis."}</p>
      <ContentFields content={content} onChange={setContent} variables={variablesOf(key)} />
      <fieldset className="email-audience">
        <legend>Destinataires</legend>
        <label className="email-check"><input type="radio" checked={audience === "consenting"} onChange={() => setAudience("consenting")} />Tous les clients qui acceptent vos emails ({data.audience.filter((person) => person.consent).length})</label>
        <label className="email-check"><input type="radio" checked={audience === "customers"} onChange={() => setAudience("customers")} />Choisir des clients</label>
        {audience === "customers" && <div className="email-picker">
          <input type="search" placeholder="Rechercher un client" value={search} onChange={(event) => setSearch(event.target.value)} />
          <ul>{people.slice(0, 200).map((person) => <li key={person.id}><label className="email-check">
            <input type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id))} />
            <span>{person.name}<small>{person.email}{person.consent ? "" : " · sans accord marketing"}</small></span>
          </label></li>)}</ul>
          {!data.audience.length && <p className="email-hint">Aucun client avec une adresse email valide.</p>}
        </div>}
      </fieldset>
      <div className="email-actions">
        <Button disabled={busy || !reach} onClick={() => {
          if (window.confirm(`Envoyer cet email à ${reach} destinataire(s) ?`))
            void run({ action: "send", templateKey: key, content, audience: audience === "consenting" ? { kind: "consenting" } : { kind: "customers", ids: selected } }, "Envoi programmé.");
        }}>Envoyer à {reach} destinataire(s)</Button>
      </div>
      <div className="email-row email-test">
        <label>M’envoyer un test<input type="email" placeholder="vous@exemple.fr" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></label>
        <Button variant="secondary" disabled={busy || !testEmail} onClick={() => void run({ action: "test", email: testEmail, templateKey: key, content }, "Test envoyé.")}>Envoyer le test</Button>
      </div>
    </div>}
    <div className="email-panel email-sticky">
      {template && content && <Preview brand={data.brand} content={content} variables={variablesOf(key)} restaurant={data.restaurant} marketing={marketing} />}
    </div>
    <div className="email-panel email-wide">
      <h2>Historique</h2>
      {data.messages.length ? <div className="email-table" role="table" aria-label="Historique des envois">
        <div role="row" className="email-table-head"><span>Date</span><span>Destinataire</span><span>Objet</span><span>Origine</span><span>Statut</span></div>
        {data.messages.map((message) => <div role="row" key={message.id}>
          <span>{new Date(message.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
          <span>{message.recipient}</span>
          <span>{message.subject ?? data.templates.find((entry) => entry.key === message.template_key)?.name ?? message.template_key}</span>
          <span>{originLabels[message.origin] ?? message.origin}</span>
          <span className={`email-status email-status-${message.status}`} title={message.error ?? undefined}>{statusLabels[message.status] ?? message.status}{message.error ? ` · ${message.error}` : ""}</span>
        </div>)}
      </div> : <p className="email-hint">Aucun email envoyé pour l’instant. Activez une automatisation ou faites un premier envoi.</p>}
    </div>
  </div>;
}

function AutomationsTab({ data, busy, run, onEdit }: TabProps & { onEdit: () => void }) {
  return <div className="email-list">
    {emailTriggers.map((trigger) => {
      const template = data.templates.find((entry) => entry.key === trigger.key);
      const enabled = !!template?.enabled;
      return <article key={trigger.key} className="email-panel email-automation">
        <div>
          <h2>{trigger.label}</h2>
          <p>{trigger.description}</p>
          <p className="email-hint">Objet : « {template?.content.subject ?? trigger.defaults.subject} »{template?.customized ? "" : " · modèle par défaut"}</p>
        </div>
        <div className="email-actions">
          <label className="email-switch">
            <input type="checkbox" role="switch" checked={enabled} disabled={busy}
              onChange={(event) => void run({ action: "automation", key: trigger.key, enabled: event.target.checked }, event.target.checked ? "Automatisation activée." : "Automatisation coupée.")} />
            <span>{enabled ? "Active" : "Inactive"}</span>
          </label>
          <Button variant="secondary" onClick={onEdit}>Personnaliser</Button>
        </div>
      </article>;
    })}
    <p className="email-hint">Les réservations demandées sur votre site et leurs changements de statut déclenchent ces emails, si la fiche contient une adresse email. Un même email n’est jamais envoyé deux fois en moins d’une heure au même client.</p>
  </div>;
}

function TemplatesTab({ data, busy, run }: TabProps) {
  const [key, setKey] = useState(data.templates[0]?.key ?? "");
  const template = data.templates.find((entry) => entry.key === key);
  const [draft, setDraft] = useState<TemplateView | null>(template ?? null);
  useEffect(() => { setDraft(template ?? null); }, [template]);
  const create = async () => {
    const ok = await run({ action: "template", template: { name: "Nouveau modèle", category: "marketing", content: {
      subject: "Des nouvelles de {{etablissement}}", preheader: "", heading: "Bonjour {{client}}",
      body: "Écrivez ici votre message.\n\nÀ bientôt,\nL'équipe {{etablissement}}", buttonLabel: "", buttonUrl: "",
    } } }, "Modèle créé.");
    if (ok) setKey("");
  };
  // Après création, le modèle libre le plus récent est le premier des modèles libres.
  useEffect(() => { if (!key && data.templates.length) setKey((data.templates.find((entry) => !entry.automatic) ?? data.templates[0]).key); }, [key, data.templates]);
  return <div className="email-grid">
    <aside className="email-panel email-template-list">
      <h2>Modèles</h2>
      <ul>{data.templates.map((entry) => <li key={entry.key}>
        <button className={entry.key === key ? "active" : ""} onClick={() => setKey(entry.key)}>
          <strong>{entry.name}</strong>
          <small>{entry.automatic ? (entry.enabled ? "Automatique · actif" : "Automatique · inactif") : entry.category === "marketing" ? "Commercial" : "Information"}</small>
        </button>
      </li>)}</ul>
      <Button variant="secondary" disabled={busy} onClick={() => void create()}>Nouveau modèle</Button>
    </aside>
    {draft && <div className="email-panel">
      <h2>{draft.automatic ? draft.name : "Modèle libre"}</h2>
      {!draft.automatic && <div className="email-row">
        <label>Nom<input value={draft.name} maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Type<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as TemplateView["category"] })}>
          <option value="marketing">Commercial (accord requis)</option>
          <option value="transactional">Information</option>
        </select></label>
      </div>}
      <ContentFields content={draft.content} onChange={(content) => setDraft({ ...draft, content })} variables={variablesOf(draft.key)} />
      <div className="email-actions">
        <Button disabled={busy} onClick={() => void run({ action: "template", template: {
          key: draft.key, content: draft.content,
          ...(draft.automatic ? { enabled: draft.enabled } : { name: draft.name, category: draft.category }),
        } }, "Modèle enregistré.")}>Enregistrer</Button>
        <Button variant="ghost" disabled={busy} onClick={() => {
          if (window.confirm(draft.automatic ? "Revenir au texte par défaut ?" : "Archiver ce modèle ? L’historique des envois est conservé."))
            void run({ action: "reset-template", key: draft.key }, draft.automatic ? "Texte par défaut rétabli." : "Modèle archivé.").then((ok) => { if (ok && !draft.automatic) setKey(data.templates[0]?.key ?? ""); });
        }}>{draft.automatic ? "Texte par défaut" : "Archiver"}</Button>
      </div>
    </div>}
    {draft && <div className="email-panel email-sticky">
      <Preview brand={data.brand} content={draft.content} variables={variablesOf(draft.key)} restaurant={data.restaurant} marketing={draft.category === "marketing"} />
    </div>}
  </div>;
}

const colorFields: { key: keyof EmailBrand; label: string }[] = [
  { key: "primary", label: "Couleur principale" },
  { key: "accent", label: "Couleur d’accent" },
  { key: "background", label: "Fond" },
  { key: "surface", label: "Carte du message" },
  { key: "text", label: "Texte" },
  { key: "muted", label: "Texte secondaire" },
  { key: "buttonText", label: "Texte sur la couleur principale" },
];

function BrandTab({ data, busy, run }: TabProps) {
  const [brand, setBrand] = useState<EmailBrand>(data.brand);
  useEffect(() => { setBrand(data.brand); }, [data.brand]);
  const set = <K extends keyof EmailBrand>(key: K, value: EmailBrand[K]) => setBrand((current) => ({ ...current, [key]: value }));
  const sample = data.templates.find((entry) => entry.key === "reservation.confirmed") ?? data.templates[0];
  return <div className="email-grid">
    <div className="email-panel">
      <h2>Identité visuelle</h2>
      <p className="email-hint">Propre à cet établissement : chaque établissement de l’organisation garde ses couleurs, ses typographies et sa signature.</p>
      <div className="email-presets" role="group" aria-label="Palettes de départ">
        {brandPresets.map((preset) => <button key={preset.id} type="button" title={preset.label} onClick={() => setBrand((current) => ({ ...current, ...preset.colors }))}>
          <span style={{ background: preset.colors.background }}><i style={{ background: preset.colors.primary }} /><i style={{ background: preset.colors.accent }} /></span>{preset.label}
        </button>)}
      </div>
      <div className="email-colors">
        {colorFields.map((field) => <label key={field.key}>
          <input type="color" aria-label={field.label} value={brand[field.key] as string} onChange={(event) => set(field.key, event.target.value as never)} />
          <span>{field.label}<small>{brand[field.key] as string}</small></span>
        </label>)}
      </div>
      <div className="email-row">
        <label>Typographie du texte<select value={brand.font} onChange={(event) => set("font", event.target.value as EmailFont)}>
          {Object.entries(emailFonts).map(([id, font]) => <option key={id} value={id}>{font.label}</option>)}
        </select></label>
        <label>Typographie des titres<select value={brand.headingFont} onChange={(event) => set("headingFont", event.target.value as EmailFont)}>
          {Object.entries(emailFonts).map(([id, font]) => <option key={id} value={id}>{font.label}</option>)}
        </select></label>
      </div>
      <div className="email-row">
        <label>En-tête<select value={brand.header} onChange={(event) => set("header", event.target.value as EmailBrand["header"])}>
          <option value="band">Bandeau de couleur</option><option value="logo">Logo seul</option><option value="name">Nom seul</option>
        </select></label>
        <label>Alignement<select value={brand.align} onChange={(event) => set("align", event.target.value as EmailBrand["align"])}>
          <option value="left">À gauche</option><option value="center">Centré</option>
        </select></label>
        <label>Boutons<select value={brand.buttonStyle} onChange={(event) => set("buttonStyle", event.target.value as EmailBrand["buttonStyle"])}>
          <option value="filled">Pleins</option><option value="outline">Contour</option><option value="pill">Arrondis</option>
        </select></label>
      </div>
      <label>Arrondi des angles <small>{brand.radius} px</small><input type="range" min={0} max={28} value={brand.radius} onChange={(event) => set("radius", Number(event.target.value))} /></label>
      <div className="email-row">
        <label>Logo (adresse https)<input type="url" placeholder="https://…/logo.png" value={brand.logoUrl} onChange={(event) => set("logoUrl", event.target.value)} /></label>
        <label>Largeur du logo <small>{brand.logoWidth} px</small><input type="range" min={60} max={320} value={brand.logoWidth} onChange={(event) => set("logoWidth", Number(event.target.value))} /></label>
      </div>
      <div className="email-row">
        <label>Nom d’expéditeur<input maxLength={80} placeholder={data.restaurant} value={brand.senderName} onChange={(event) => set("senderName", event.target.value)} /></label>
        <label>Adresse de réponse<input type="email" placeholder="contact@votre-etablissement.fr" value={brand.replyTo} onChange={(event) => set("replyTo", event.target.value)} /></label>
      </div>
      <label>Signature<textarea rows={3} maxLength={400} value={brand.signature} onChange={(event) => set("signature", event.target.value)} /></label>
      <label>Pied de page <small>adresse, horaires, mentions</small><textarea rows={3} maxLength={600} value={brand.footer} onChange={(event) => set("footer", event.target.value)} /></label>
      <label>Site internet<input type="url" placeholder="https://" value={brand.websiteUrl} onChange={(event) => set("websiteUrl", event.target.value)} /></label>
      <div className="email-actions">
        <Button disabled={busy} onClick={() => void run({ action: "brand", brand }, "Identité visuelle enregistrée.")}>Enregistrer</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setBrand(data.brand)}>Annuler les modifications</Button>
      </div>
    </div>
    <div className="email-panel email-sticky">
      {sample && <Preview brand={brand} content={sample.content} variables={variablesOf(sample.key)} restaurant={data.restaurant} marketing={false} />}
    </div>
  </div>;
}

function SmtpTab({ data, busy, run }: TabProps) {
  const initial = data.transport;
  const [mode, setMode] = useState<TransportView["mode"]>(initial.mode);
  const [form, setForm] = useState({
    host: initial.host ?? "", port: initial.port ?? 587, security: initial.security ?? "starttls",
    username: initial.username ?? "", password: "", fromEmail: initial.fromEmail ?? "", fromName: initial.fromName ?? "",
  });
  const [testEmail, setTestEmail] = useState("");
  const set = (key: keyof typeof form, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const testKey = data.templates[0]?.key;
  return <div className="email-grid">
    <div className="email-panel">
      <h2>Expédition</h2>
      <label className="email-option">
        <input type="radio" checked={mode === "platform"} onChange={() => setMode("platform")} />
        <span><strong>SMTP de la plateforme</strong>
          <small>Le même serveur que les emails de connexion (branché sur Supabase). Rien à configurer : vos clients voient votre nom d’expéditeur et leurs réponses arrivent à votre adresse de réponse.{data.platform.sender ? ` Adresse d’envoi : ${data.platform.sender}.` : ""}</small>
          {!data.platform.configured && <small className="email-warning">Non actif dans cet environnement : les envois sont simulés et tracés.</small>}
        </span>
      </label>
      <label className="email-option">
        <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
        <span><strong>Mon propre serveur SMTP</strong>
          <small>Envoyez depuis votre domaine (Google Workspace, Microsoft 365, OVH, Brevo…). Le mot de passe est chiffré et n’est jamais réaffiché.</small></span>
      </label>
      {mode === "custom" && <form className="email-fields" onSubmit={(event) => { event.preventDefault(); }}>
        <div className="email-row">
          <label>Serveur<input required placeholder="smtp.exemple.fr" value={form.host} onChange={(event) => set("host", event.target.value)} /></label>
          <label>Port<select value={form.port} onChange={(event) => { const port = Number(event.target.value); setForm((current) => ({ ...current, port, security: port === 465 ? "tls" : "starttls" })); }}>
            {[587, 465, 2525, 25].map((port) => <option key={port} value={port}>{port}</option>)}
          </select></label>
          <label>Chiffrement<select value={form.security} onChange={(event) => set("security", event.target.value)}>
            <option value="starttls">STARTTLS</option><option value="tls">TLS direct</option>
          </select></label>
        </div>
        <div className="email-row">
          <label>Identifiant<input autoComplete="off" value={form.username} onChange={(event) => set("username", event.target.value)} /></label>
          <label>Mot de passe<input type="password" autoComplete="new-password" placeholder={initial.hasPassword ? "•••••• (inchangé)" : ""} value={form.password} onChange={(event) => set("password", event.target.value)} /></label>
        </div>
        <div className="email-row">
          <label>Adresse d’expédition<input type="email" required placeholder="bonjour@votre-domaine.fr" value={form.fromEmail} onChange={(event) => set("fromEmail", event.target.value)} /></label>
          <label>Nom d’expéditeur<input maxLength={120} placeholder={data.brand.senderName || data.restaurant} value={form.fromName} onChange={(event) => set("fromName", event.target.value)} /></label>
        </div>
        {initial.mode === "custom" && <p className={initial.lastError ? "email-warning" : "email-hint"}>
          {initial.lastError ? `Dernière erreur : ${initial.lastError}` : initial.verifiedAt ? `Dernier envoi réussi le ${new Date(initial.verifiedAt).toLocaleString("fr-FR")}.` : "Pas encore vérifié : envoyez-vous un test."}
        </p>}
      </form>}
      <div className="email-actions">
        <Button disabled={busy} onClick={() => void run({ action: "transport", transport: mode === "platform" ? { mode } : { mode, ...form, port: Number(form.port) } }, "Configuration d’envoi enregistrée.").then((ok) => { if (ok) set("password", ""); })}>Enregistrer</Button>
      </div>
      {testKey && <div className="email-row email-test">
        <label>Vérifier avec un email de test<input type="email" placeholder="vous@exemple.fr" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></label>
        <Button variant="secondary" disabled={busy || !testEmail} onClick={() => void run({ action: "test", email: testEmail, templateKey: testKey }, "Test envoyé.")}>Envoyer le test</Button>
      </div>}
      <p className="email-hint">Le test utilise la configuration enregistrée. Pensez à déclarer SPF et DKIM pour votre domaine afin d’éviter les courriers indésirables.</p>
    </div>
  </div>;
}
