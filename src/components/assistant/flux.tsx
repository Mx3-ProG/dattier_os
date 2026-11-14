"use client";
/* FLUX : le créateur de site de l’assistant. Une demande, écrite ou dictée,
   et le site est construit (couleurs, textes, fond, sections). L’utilisateur
   confirme pour l’enregistrer dans le brouillon, ou le publier directement. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Gift, Loader2, Mic, MicOff, ShoppingBag, Sparkles, Wand2, Zap } from "lucide-react";

type Plan = Record<string, unknown>;
type Suggestion = {
  id: string;
  name: string;
  reason: string;
  priceCents: number;
  pricing: "free" | "one_time" | "subscription";
};
type Build = {
  reply: string;
  plan: Plan;
  summary: string[];
  palette: { primary: string; background: string; accent: string; text: string; button: string };
  suggestions: Suggestion[];
  engine: "reflex" | "llm";
  credits: number;
  balance: number;
};
type Message = { id: string; role: "user" | "assistant"; text: string; build?: Build };
type Applied = { state: "running" | "draft" | "published" | "error"; error?: string; version?: number | null };

/** Prévenu après chaque enregistrement : l’éditeur de site recharge son brouillon. */
export const FLUX_APPLIED_EVENT = "flux:applied";

const starters = [
  "Crée le site de ma pizzeria Da Marco, en rouge, avec commande en ligne",
  "Boutique en ligne de bijoux faits main, chic, fond crème, livraison",
  "Café cosy « Le Nid », couleurs douces, brunch le week-end",
  "Restaurant gastronomique élégant avec réservation, fond sombre",
];
const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const uid = () => Math.random().toString(36).slice(2);
const plain = (text: string) => text.replace(/\*/g, "");

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => Recognition) | null;
}

export function FluxView({ restaurant, onBalance }: { restaurant: string; onBalance: (balance: number) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Record<string, Applied>>({});
  const [addonState, setAddonState] = useState<Record<string, string>>({});
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [canDictate, setCanDictate] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const base = `/api/restaurants/${encodeURIComponent(restaurant)}/assistant/flux`;

  useEffect(() => setCanDictate(!!recognitionClass()), []);
  useEffect(() => {
    void fetch(base)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && onBalance(d.balance))
      .catch(() => {});
  }, [base, onBalance]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, interim]);
  useEffect(() => () => recognition.current?.abort(), []);

  const send = useCallback(
    async (text: string, spoken = false) => {
      const message = text.trim();
      if (message.length < 2 || busy) return;
      const history = messagesRef.current.slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));
      setMessages((m) => [...m, { id: uid(), role: "user", text: message }]);
      setInput("");
      setBusy(true);
      try {
        const r = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "build", message, history }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || d.error || "FLUX est indisponible.");
        const build = d as Build;
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: build.reply, build }]);
        onBalance(build.balance);
        if (spoken && "speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(plain(build.reply));
          u.lang = "fr-FR";
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        }
      } catch (e) {
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: (e as Error).message }]);
      } finally {
        setBusy(false);
      }
    },
    [base, busy, onBalance],
  );

  /* Dictée : la demande part toute seule après un vrai silence. */
  function dictate() {
    const Rec = recognitionClass();
    if (!Rec) return;
    if (listening) return recognition.current?.stop();
    const rec = new Rec();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    let final = "";
    let partial = "";
    let silence: ReturnType<typeof setTimeout> | undefined;
    rec.onresult = (e) => {
      partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += ` ${e.results[i][0].transcript}`;
        else partial += e.results[i][0].transcript;
      }
      setInterim(`${final} ${partial}`.replace(/\s+/g, " ").trim());
      clearTimeout(silence);
      silence = setTimeout(() => rec.stop(), 2200);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: "Micro refusé par le navigateur : autorisez-le pour dicter votre site." }]);
    };
    rec.onend = () => {
      clearTimeout(silence);
      setListening(false);
      setInterim("");
      const said = `${final} ${partial}`.replace(/\s+/g, " ").trim();
      if (said) void send(said, true);
    };
    recognition.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  async function apply(id: string, plan: Plan, publish: boolean) {
    if (applied[id]?.state === "running") return;
    setApplied((s) => ({ ...s, [id]: { state: "running" } }));
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "apply", plan, publish }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || d.error || "Enregistrement impossible.");
      try {
        sessionStorage.removeItem(`atacuisine-cms-unsaved:${restaurant}`);
      } catch {
        /* Stockage privé indisponible. */
      }
      window.dispatchEvent(new CustomEvent(FLUX_APPLIED_EVENT, { detail: { revision: d.revision } }));
      setApplied((s) => ({ ...s, [id]: { state: d.published ? "published" : "draft", version: d.published } }));
    } catch (e) {
      setApplied((s) => ({ ...s, [id]: { state: "error", error: (e as Error).message } }));
    }
  }

  async function addon(s: Suggestion) {
    setAddonState((x) => ({ ...x, [s.id]: "running" }));
    try {
      const r = await fetch(`/api/restaurants/${encodeURIComponent(restaurant)}/addons/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: s.pricing === "free" ? "install" : "purchase", product: s.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || d.error || "Action impossible.");
      if (d.url) {
        window.location.assign(d.url);
        return;
      }
      setAddonState((x) => ({ ...x, [s.id]: "done" }));
    } catch (e) {
      setAddonState((x) => ({ ...x, [s.id]: (e as Error).message }));
    }
  }

  return (
    <>
      <div className="cia-body" ref={list} aria-live="polite">
        {!messages.length && (
          <div className="cia-empty">
            <h2>Décrivez votre site, FLUX le construit.</h2>
            <p>
              En une phrase, écrite ou dictée : votre activité, votre nom, vos couleurs, l’ambiance. FLUX pose la base e-commerce, les
              textes, les couleurs et le fond, avec les modèles et add-ons gratuits.
            </p>
            <div className="cia-chips">
              {starters.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
            {canDictate && (
              <button className="cia-voice-cta" onClick={dictate}>
                <Mic size={16} aria-hidden /> Dicter mon site
              </button>
            )}
          </div>
        )}
        {messages.map((m) => {
          const b = m.build;
          const st = applied[m.id];
          return (
            <div key={m.id} className={`cia-msg ${m.role}`}>
              <p>{m.text}</p>
              {b && (
                <div className={`cia-card flux-card ${st?.state === "draft" || st?.state === "published" ? "done" : ""}`}>
                  <b>
                    <Wand2 size={15} aria-hidden /> Votre site
                  </b>
                  <div
                    className="flux-preview"
                    style={{ background: b.palette.background, color: b.palette.text }}
                    aria-label="Aperçu des couleurs du site"
                  >
                    <small style={{ color: b.palette.primary }}>{String((b.plan.hero as { kicker?: string })?.kicker ?? "")}</small>
                    <strong>{plain(String((b.plan.hero as { title?: string })?.title ?? ""))}</strong>
                    <span className="flux-button" style={{ background: b.palette.primary, color: b.palette.button }}>
                      {String((b.plan.hero as { primaryLabel?: string })?.primaryLabel ?? "")}
                    </span>
                    <span className="flux-swatches" aria-hidden>
                      {[b.palette.primary, b.palette.accent, b.palette.background, b.palette.text].map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                  <ul>
                    {b.summary.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  {st?.state === "error" && <p className="cia-warn">{st.error}</p>}
                  {st?.state === "draft" || st?.state === "published" ? (
                    <>
                      <p className="cia-done">
                        <Check size={15} aria-hidden />{" "}
                        {st.state === "published" ? `Publié · version ${st.version}` : "Enregistré dans le brouillon"}
                      </p>
                      <div className="cia-links">
                        <Link href={`/restaurant/${encodeURIComponent(restaurant)}/site`}>Ouvrir l’éditeur pour retoucher →</Link>
                      </div>
                    </>
                  ) : (
                    <div className="cia-card-actions">
                      <button className="primary" disabled={st?.state === "running"} onClick={() => apply(m.id, b.plan, false)}>
                        {st?.state === "running" ? <Loader2 size={15} className="cia-spin" /> : <Check size={15} />}
                        Appliquer au site
                      </button>
                      <button disabled={st?.state === "running"} onClick={() => apply(m.id, b.plan, true)}>
                        Appliquer et publier
                      </button>
                    </div>
                  )}
                  <small className="cia-muted">Le brouillon actuel est remplacé ; vos versions publiées restent restaurables.</small>
                </div>
              )}
              {b && b.suggestions.length > 0 && (
                <div className="flux-addons">
                  <span className="flux-addons-title">
                    <Sparkles size={13} aria-hidden /> Pour aller plus loin
                  </span>
                  {b.suggestions.map((s) => {
                    const state = addonState[s.id];
                    return (
                      <article key={s.id}>
                        <div>
                          <b>{s.name}</b>
                          <small>{s.reason}</small>
                        </div>
                        {state === "done" ? (
                          <span className="cia-done">
                            <Check size={14} aria-hidden /> Installé
                          </span>
                        ) : (
                          <button disabled={state === "running"} onClick={() => addon(s)}>
                            {state === "running" ? (
                              <Loader2 size={14} className="cia-spin" />
                            ) : s.pricing === "free" ? (
                              <Gift size={14} aria-hidden />
                            ) : (
                              <ShoppingBag size={14} aria-hidden />
                            )}
                            {s.pricing === "free" ? "Installer · gratuit" : `Acheter · ${euros(s.priceCents)}${s.pricing === "subscription" ? "/mois" : ""}`}
                          </button>
                        )}
                        {state && !["running", "done"].includes(state) && <p className="cia-warn">{state}</p>}
                      </article>
                    );
                  })}
                </div>
              )}
              {b && (
                <small className="cia-meta">
                  {b.engine === "llm" ? <Sparkles size={11} /> : <Zap size={11} />}
                  {b.engine === "llm" ? "IA avancée" : "Réflexe"} · {b.credits} crédit{b.credits > 1 ? "s" : ""}
                </small>
              )}
              {b && (
                <div className="cia-chips">
                  {["Change les couleurs en bleu nuit", "Ton plus chic et élégant", "Mets la réservation en avant"].map((s) => (
                    <button key={s} onClick={() => send(`${s}. (Base : ${messagesRef.current.filter((x) => x.role === "user").at(-1)?.text ?? ""})`)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="cia-msg assistant cia-typing" aria-label="FLUX construit votre site">
            <i />
            <i />
            <i />
          </div>
        )}
        {interim && (
          <div className="cia-msg user interim">
            <p>{interim}</p>
          </div>
        )}
      </div>
      <form
        className="cia-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="cia-row">
          {canDictate && (
            <button
              type="button"
              className={`cia-mic ${listening ? "on listening" : ""}`}
              onClick={dictate}
              aria-pressed={listening}
              aria-label={listening ? "Arrêter la dictée" : "Dicter ma demande"}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <textarea
            rows={1}
            value={input}
            maxLength={1500}
            placeholder="« Site pour ma boulangerie Le Fournil, tons dorés, commande en ligne »"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            aria-label="Votre demande à FLUX"
          />
          <button type="submit" className="cia-send" disabled={busy || input.trim().length < 2} aria-label="Construire le site">
            {busy ? <Loader2 size={18} className="cia-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
        <small className="cia-foot">FLUX construit, vous confirmez. Rien n’est publié sans votre accord.</small>
      </form>
    </>
  );
}
