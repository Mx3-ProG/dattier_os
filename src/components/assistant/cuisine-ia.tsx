"use client";
/* STUDIO VOICE : l’assistant du restaurateur, à l’écrit ou à la voix.
   Ouvrable de partout via openCuisineIa() (bouton du poste, guide, admin). */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Check,
  Coins,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Settings,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import "./cuisine-ia.css";

type ActionPayload = { action: string } & Record<string, unknown>;
type Proposal = {
  id: string;
  title: string;
  lines: string[];
  warning?: string;
  confirmLabel: string;
  actions: ActionPayload[];
  next: string[];
  open?: string;
};
type Reply = {
  reply: string;
  proposals: Proposal[];
  suggestions: string[];
  links: { label: string; href: string }[];
  navigate?: string;
  followUp?: string;
  engine: "reflex" | "llm" | "free" | "none";
  credits: number;
  balance: number;
};
type Message = { id: string; role: "user" | "assistant"; text: string } & Partial<Reply>;
type Pack = {
  id: string;
  title: string;
  credits: number;
  priceCents: number;
  hint: string;
  featured?: boolean;
};
type State = {
  balance: number;
  admin: boolean;
  lowBalance: number;
  welcomeCredits: number;
  llm: boolean;
  packs: Pack[];
  history: { delta: number; kind: string; engine: string | null; detail: string; created_at: string }[];
  pending: { id: number; pack: string; credits: number; price_cents: number; created_at: string }[];
};
type Status = { state: "running" | "done" | "dismissed" | "error"; error?: string };

const OPEN_EVENT = "cuisine-ia:open";
/** Ouvre STUDIO VOICE, éventuellement avec une question déjà posée. */
export function openCuisineIa(prompt?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prompt } }));
}

const starters = [
  "Commande table 4 : deux couscous agneau et un thé",
  "Aide-moi à gérer les stocks",
  "Achète 3 kg de fraises",
  "Ajoute le fournisseur Verger Bio qui vend des fraises",
  "Livraisons attendues",
  "Chiffre du jour",
  "Comment créer un code promo ?",
];
const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const uid = () => Math.random().toString(36).slice(2);

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length}>
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*(?:[•\-*]|\d+\.)\s+(.*)$/);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}
const spoken = (text: string) =>
  text
    .replace(/\*\*/g, "")
    .replace(/^\s*[•\-*]\s*/gm, "")
    .replace(/€/g, " euros")
    .split("\n")
    .slice(0, 6)
    .join(". ");

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

async function defaultExecute(restaurant: string, payload: ActionPayload) {
  const r = await fetch("/api/v1/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, restaurant }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : d.error?.message || "Action impossible.");
  return d.result;
}

/** Remplace « $N » par l’identifiant créé par la N-ième action de la carte. */
function resolve(value: unknown, results: unknown[]): unknown {
  if (typeof value === "string") {
    const ref = value.match(/^\$(\d+)$/);
    if (!ref) return value;
    const id = (results[Number(ref[1])] as { id?: string } | undefined)?.id;
    if (!id) throw new Error("Étape précédente incomplète : réessayez.");
    return id;
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, results));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, results)]));
  return value;
}

export function CuisineIa({
  restaurant,
  execute,
  onNavigate,
  launcher = true,
  docked = false,
}: {
  restaurant: string;
  /** Exécute une action confirmée (le poste passe son `act`, qui rafraîchit l’écran). */
  execute?: (payload: ActionPayload) => Promise<unknown>;
  onNavigate?: (module: string) => void;
  launcher?: boolean;
  /** Une barre fixe occupe le bas de l’écran (administration). */
  docked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "credits" | "settings">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [notice, setNotice] = useState("");
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [preferences, setPreferences] = useState({ voiceURI: "", rate: 1.05, pitch: 1 });
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const updatePreferences = (next: typeof preferences) => {
    setPreferences(next);
    try { localStorage.setItem("cuisine-ia:voice:v1", JSON.stringify(next)); } catch { /* Stockage privé indisponible. */ }
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cuisine-ia:voice:v1") || "null");
      if (saved) setPreferences({
        voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : "",
        rate: typeof saved.rate === "number" && Number.isFinite(saved.rate) ? Math.min(1.5, Math.max(0.6, saved.rate)) : 1.05,
        pitch: typeof saved.pitch === "number" && Number.isFinite(saved.pitch) ? Math.min(1.5, Math.max(0.5, saved.pitch)) : 1,
      });
    } catch { /* Les valeurs par défaut restent utilisables. */ }
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener("voiceschanged", load);
    return () => { synth.removeEventListener("voiceschanged", load); synth.cancel(); };
  }, []);
  const recognition = useRef<Recognition | null>(null);
  const voiceRef = useRef(false);
  const busyRef = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const statusesRef = useRef<Record<string, Status>>({});
  const progress = useRef<Record<string, unknown[]>>({});
  const handleVoiceRef = useRef<(said: string) => Promise<void>>(async () => {});
  messagesRef.current = messages;
  statusesRef.current = statuses;

  const base = `/api/restaurants/${encodeURIComponent(restaurant)}/assistant`;
  const refresh = useCallback(async () => {
    const r = await fetch(base);
    if (r.ok) setState(await r.json());
  }, [base]);

  useEffect(() => setVoiceSupported(!!recognitionClass() && "speechSynthesis" in window), []);
  useEffect(() => {
    setMessages([]);
    setState(null);
  }, [restaurant]);
  useEffect(() => {
    if (open && !state) void refresh();
  }, [open, state, refresh]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, interim]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const speak = useCallback((text: string, then?: () => void) => {
    if (!("speechSynthesis" in window)) return then?.();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken(text));
    u.lang = "fr-FR";
    const prefs = preferencesRef.current;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    const available = window.speechSynthesis.getVoices();
    const fr = available.find((v) => v.voiceURI === prefs.voiceURI)
      ?? available.find((v) => v.lang.startsWith("fr"));
    if (fr) { u.voice = fr; u.lang = fr.lang; }
    setSpeaking(true);
    u.onend = u.onerror = () => {
      setSpeaking(false);
      then?.();
    };
    window.speechSynthesis.speak(u);
  }, []);

  /* Écoute continue : la phrase n’est envoyée qu’après un vrai silence, pour
     capter les demandes longues (« aide-moi à gérer les stocks et à acheter
     des fraises chez… »). Un silence plus long est accordé quand la phrase
     finit sur un mot qui annonce une suite (« et », « de », « chez »…). */
  const listen = useCallback(() => {
    const Rec = recognitionClass();
    if (!Rec || !voiceRef.current || busyRef.current) return;
    recognition.current?.abort();
    const rec = new Rec();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    let final = "";
    let partial = "";
    let silence: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      rec.stop();
    };
    rec.onresult = (e) => {
      partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += ` ${e.results[i][0].transcript}`;
        else partial += e.results[i][0].transcript;
      }
      const heard = `${final} ${partial}`.replace(/\s+/g, " ").trim();
      setInterim(heard);
      clearTimeout(silence);
      const unfinished = /\b(et|de|du|des|chez|pour|avec|à|a|le|la|les|un|une|puis|plus)$/i.test(heard);
      silence = setTimeout(finish, unfinished ? 2600 : 1400);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        voiceRef.current = false;
        setVoice(false);
        setNotice("Micro refusé par le navigateur. Autorisez-le pour le mode vocal.");
      }
    };
    rec.onend = () => {
      clearTimeout(silence);
      setListening(false);
      setInterim("");
      const said = `${final} ${partial}`.replace(/\s+/g, " ").trim();
      if (said) void handleVoiceRef.current(said);
      else if (voiceRef.current && !busyRef.current) setTimeout(() => listenRef.current(), 250);
    };
    recognition.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, []);
  const listenRef = useRef(listen);
  listenRef.current = listen;

  const runProposal = useCallback(
    async (p: Proposal) => {
      if (statusesRef.current[p.id]?.state === "running" || statusesRef.current[p.id]?.state === "done") return;
      setStatuses((s) => ({ ...s, [p.id]: { state: "running" } }));
      // Les étapes déjà réussies ne sont pas rejouées après une erreur.
      const results = (progress.current[p.id] ??= []);
      try {
        for (let i = results.length; i < p.actions.length; i++) {
          const payload = resolve(p.actions[i], results) as ActionPayload;
          results.push((await (execute ? execute(payload) : defaultExecute(restaurant, payload))) ?? null);
        }
        setStatuses((s) => ({ ...s, [p.id]: { state: "done" } }));
        if (p.open) onNavigate?.(p.open);
        return true;
      } catch (e) {
        setStatuses((s) => ({ ...s, [p.id]: { state: "error", error: (e as Error).message } }));
        return false;
      }
    },
    [execute, onNavigate, restaurant],
  );

  const send = useCallback(
    async (text: string, spokenReply = false) => {
      const message = text.trim();
      if (!message || busyRef.current) return;
      if (/^recharger (mes )?credits?$/i.test(message.normalize("NFD").replace(/[̀-ͯ]/g, ""))) {
        void refresh();
        setView("credits");
        return;
      }
      const last = messagesRef.current.at(-1);
      const followUp = last?.role === "assistant" ? last.followUp : undefined;
      const history = messagesRef.current
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));
      setMessages((m) => [...m, { id: uid(), role: "user", text: message }]);
      setInput("");
      setNotice("");
      setBusy(true);
      busyRef.current = true;
      try {
        const r = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "ask", message, history, voice: spokenReply, followUp }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || "STUDIO VOICE est indisponible.");
        const reply = d as Reply;
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: reply.reply, ...reply }]);
        setState((s) => (s ? { ...s, balance: reply.balance } : s));
        if (reply.navigate) onNavigate?.(reply.navigate);
        if (spokenReply)
          speak(
            reply.reply +
              (reply.proposals.length > 1
                ? `. ${reply.proposals.length} actions prêtes. Dites oui pour tout confirmer, « la première » pour une seule, ou non.`
                : reply.proposals.length
                  ? ". Dites oui pour confirmer, ou non pour annuler."
                  : ""),
            () => listen(),
          );
      } catch (e) {
        const error = (e as Error).message;
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            text: error,
            suggestions: /insuffisants/.test(error) ? ["Recharger mes crédits"] : [],
          },
        ]);
        if (spokenReply) speak(error, () => listen());
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [base, listen, onNavigate, refresh, speak],
  );

  /** Cartes encore en attente dans la dernière réponse qui en propose. */
  const pendingProposals = () => {
    const last = [...messagesRef.current].reverse().find((m) => m.proposals?.length);
    return (last?.proposals ?? []).filter((p) => !statusesRef.current[p.id]);
  };

  async function handleVoice(said: string) {
    const n = said.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, " ").trim();
    const pending = pendingProposals();
    const short = n.split(" ").length <= 6;
    const ordinal = n.match(/\b(premier|premiere|deuxieme|second|seconde|troisieme)\b/);
    if (pending.length && short && (ordinal || /^(oui|ouais|ok|d accord|confirme|valide|vas y|go|c est bon|envoie|parfait|fais le|lance)\b/.test(n))) {
      const index = ordinal ? { premier: 0, premiere: 0, deuxieme: 1, second: 1, seconde: 1, troisieme: 2 }[ordinal[1]]! : -1;
      const chosen = index >= 0 ? pending.slice(index, index + 1) : pending;
      setMessages((m) => [...m, { id: uid(), role: "user", text: said }]);
      const done: Proposal[] = [];
      for (const p of chosen) if (await runProposal(p)) done.push(p);
      const next = [...new Set(done.flatMap((p) => p.next))].slice(0, 3);
      const text = done.length
        ? `C’est fait : ${done.map((p) => p.title).join(", ")}.${next.length ? ` Ensuite, je peux : ${next.join(", ou ")}.` : ""}`
        : "L’action a échoué, regardez l’écran.";
      setMessages((m) => [...m, { id: uid(), role: "assistant", text, suggestions: next }]);
      speak(text, () => listen());
      return;
    }
    if (pending.length && short && /^(non|annule|stop|laisse tomber|pas maintenant|oublie)\b/.test(n)) {
      setStatuses((s) => ({ ...s, ...Object.fromEntries(pending.map((p) => [p.id, { state: "dismissed" as const }])) }));
      setMessages((m) => [...m, { id: uid(), role: "user", text: said }, { id: uid(), role: "assistant", text: "C’est annulé." }]);
      speak("C’est annulé.", () => listen());
      return;
    }
    if (/^(arrete|fin du mode vocal|stop ecoute|merci c est tout)\b/.test(n)) {
      stopVoice();
      return;
    }
    await send(said, true);
  }
  handleVoiceRef.current = handleVoice;

  function startVoice() {
    voiceRef.current = true;
    setVoice(true);
    speak(messagesRef.current.length ? "Je vous écoute." : "Bonjour, je vous écoute.", () => listen());
  }
  function stopVoice() {
    voiceRef.current = false;
    setVoice(false);
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    setListening(false);
    setSpeaking(false);
    setInterim("");
  }

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      setView("chat");
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt) void send(prompt);
      else setTimeout(() => field.current?.focus(), 50);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [send]);
  useEffect(() => {
    if (!open) stopVoice();
     
  }, [open]);

  async function requestPack(pack: string) {
    setNotice("");
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "pack", pack }),
    });
    const d = await r.json();
    if (!r.ok) return setNotice(d.error?.message || "Demande impossible.");
    setState(d);
    setNotice("Demande envoyée. Les crédits sont ajoutés dès réception du paiement.");
  }

  const low = state && state.balance < state.lowBalance;

  return (
    <>
      {launcher && !open && (
        <button data-tour="ia-button" className={`cia-launcher ${docked ? "docked" : ""}`} onClick={() => openCuisineIa()} aria-label="Ouvrir STUDIO VOICE">
          <Sparkles size={20} aria-hidden />
          <span>STUDIO VOICE</span>
        </button>
      )}
      {open && (
        <section className="cia-panel" role="dialog" aria-label="STUDIO VOICE">
          <header className="cia-head">
            <span className="cia-mark" aria-hidden>
              <Sparkles size={18} />
            </span>
            <div className="cia-title">
              <strong>STUDIO VOICE</strong>
              <small>
                {voice
                  ? listening
                    ? "Je vous écoute…"
                    : speaking
                      ? "Je réponds…"
                      : busy
                        ? "Je réfléchis…"
                        : "Mode vocal actif"
                  : state?.llm
                    ? "Réflexe + IA avancée"
                    : "Moteur réflexe"}
              </small>
            </div>
            <button
              className={`cia-credits ${low ? "low" : ""}`}
              onClick={() => {
                if (view !== "credits") void refresh();
                setView(view === "credits" ? "chat" : "credits");
              }}
              aria-label="Mes crédits STUDIO VOICE"
            >
              <Coins size={14} aria-hidden /> {state ? state.balance.toLocaleString("fr-FR") : "…"}
            </button>
            <button className="cia-icon" onClick={() => { stopVoice(); setView(view === "settings" ? "chat" : "settings"); }} aria-label="Paramètres de STUDIO VOICE" aria-pressed={view === "settings"}>
              <Settings size={18} />
            </button>
            <button className="cia-icon" onClick={() => setOpen(false)} aria-label="Fermer STUDIO VOICE">
              <X size={18} />
            </button>
          </header>

          {view === "settings" ? (
            <div className="cia-body cia-settings">
              <h2>Paramètres de STUDIO VOICE</h2>
              <p>Personnalisez la voix de synthèse. Vos choix sont conservés dans ce navigateur et s’appliquent à vos prochaines réponses vocales.</p>
              <label htmlFor="cia-voice">Voix disponible sur cet appareil</label>
              <select id="cia-voice" value={voices.some(v => v.voiceURI === preferences.voiceURI) ? preferences.voiceURI : ""} onChange={e => updatePreferences({ ...preferences, voiceURI: e.target.value })}>
                <option value="">Automatique · français si disponible</option>
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}{v.localService ? " · sur l’appareil" : " · service en ligne"}</option>)}
              </select>
              {!voices.length && <p role="status">Aucune voix chargée pour le moment. Les voix dépendent du navigateur et du système.</p>}
              {preferences.voiceURI && !voices.some(v => v.voiceURI === preferences.voiceURI) && <p>La voix enregistrée n’est plus disponible. La voix automatique sera utilisée.</p>}
              <label htmlFor="cia-rate">Débit · {preferences.rate.toFixed(2)}×</label>
              <input id="cia-rate" type="range" min="0.6" max="1.5" step="0.05" value={preferences.rate} onChange={e => updatePreferences({ ...preferences, rate: Number(e.target.value) })} />
              <label htmlFor="cia-pitch">Hauteur · {preferences.pitch.toFixed(2)}</label>
              <input id="cia-pitch" type="range" min="0.5" max="1.5" step="0.05" value={preferences.pitch} onChange={e => updatePreferences({ ...preferences, pitch: Number(e.target.value) })} />
              <button className="cia-back" disabled={!voices.length} onClick={() => speaking ? window.speechSynthesis.cancel() : speak("Bonjour, je suis STUDIO VOICE. Je vous aide à gérer votre restaurant. Voilà un aperçu de ma voix.")}>{speaking ? "Arrêter l’aperçu" : "Écouter cette voix"}</button>
              <button className="cia-back" onClick={() => updatePreferences({ voiceURI: "", rate: 1.05, pitch: 1 })}>Rétablir les réglages par défaut</button>
              <p>Voix du navigateur, sans intégration d’un service payant. Certaines voix utilisent une connexion Internet. Leur qualité varie selon l’appareil. Les voix OpenAI ne sont pas connectées.</p>
              <p>Moteur actuel : {state?.llm ? "réflexe et IA avancée" : "réflexe"}. Les actions de gestion restent soumises à votre confirmation.</p>
              <button className="cia-back" onClick={() => { window.speechSynthesis?.cancel(); setView("chat"); }}>Revenir à la conversation</button>
            </div>
          ) : view === "credits" && state ? (
            <div className="cia-body cia-wallet">
              <div className="cia-balance">
                <span>Solde</span>
                <strong>{state.balance.toLocaleString("fr-FR")} crédits</strong>
                <small>
                  Réponse réflexe : 1 crédit · analyse IA avancée : 2 à 60 crédits selon la longueur · solde, aide et navigation : gratuits.
                </small>
              </div>
              <h3>Recharger</h3>
              <div className="cia-packs">
                {state.packs.map((p) => (
                  <article key={p.id} className={p.featured ? "featured" : ""}>
                    {p.featured && <span className="cia-badge">Populaire</span>}
                    <b>{p.title}</b>
                    <strong>{p.credits.toLocaleString("fr-FR")} crédits</strong>
                    <span className="cia-price">{euros(p.priceCents)} HT</span>
                    <small>{p.hint}</small>
                    <button disabled={!state.admin} onClick={() => requestPack(p.id)}>
                      {state.admin ? "Commander" : "Réservé à l’admin"}
                    </button>
                  </article>
                ))}
              </div>
              {notice && <p className="cia-notice" role="status">{notice}</p>}
              {state.pending.length > 0 && (
                <>
                  <h3>En attente de paiement</h3>
                  <ul className="cia-ledger">
                    {state.pending.map((p) => (
                      <li key={p.id}>
                        <span>Pack {p.pack} · {new Date(p.created_at).toLocaleDateString("fr-FR")}</span>
                        <b>+{p.credits.toLocaleString("fr-FR")}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3>Historique</h3>
              <ul className="cia-ledger">
                {state.history.map((h, i) => (
                  <li key={i}>
                    <span>
                      {h.kind === "welcome"
                        ? "Bienvenue"
                        : h.kind === "purchase"
                          ? "Recharge"
                          : h.kind === "bonus"
                            ? "Bonus"
                            : h.engine === "reflex"
                              ? "Réflexe"
                              : "IA avancée"}
                      {h.detail ? ` · ${h.detail.slice(0, 48)}` : ""}
                    </span>
                    <b className={h.delta > 0 ? "plus" : ""}>
                      {h.delta > 0 ? "+" : ""}
                      {h.delta}
                    </b>
                  </li>
                ))}
              </ul>
              <button className="cia-back" onClick={() => setView("chat")}>
                Revenir à la conversation
              </button>
            </div>
          ) : (
            <div className="cia-body" ref={list} aria-live="polite">
              {!messages.length && (
                <div className="cia-empty">
                  <h2>Que puis-je faire pour votre service ?</h2>
                  <p>
                    Demandez, je prépare : commandes, règlements, stocks, réservations, chiffres et mode d’emploi. Vous confirmez, j’exécute.
                  </p>
                  <div className="cia-chips">
                    {starters.map((s) => (
                      <button key={s} onClick={() => send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {voiceSupported && (
                    <button className="cia-voice-cta" onClick={startVoice}>
                      <Mic size={16} aria-hidden /> Parler à STUDIO VOICE en temps réel
                    </button>
                  )}
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`cia-msg ${m.role}`}>
                  {m.role === "assistant" ? <Rich text={m.text} /> : <p>{m.text}</p>}
                  {m.proposals?.map((p) => {
                    const st = statuses[p.id];
                    return (
                      <div key={p.id} className={`cia-card ${st?.state ?? ""}`}>
                        <b>{p.title}</b>
                        <ul>
                          {p.lines.map((l, i) => (
                            <li key={i} className={/^(Total|Livraison attendue)/.test(l) ? "total" : undefined}>
                              {l}
                            </li>
                          ))}
                        </ul>
                        {p.warning && <p className="cia-warn">{p.warning}</p>}
                        {st?.state === "error" && <p className="cia-warn">{st.error}</p>}
                        {st?.state === "done" ? (
                          <>
                            <p className="cia-done">
                              <Check size={15} aria-hidden /> Fait
                            </p>
                            <div className="cia-chips">
                              {p.next.map((s) => (
                                <button key={s} onClick={() => send(s)}>
                                  {s}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : st?.state === "dismissed" ? (
                          <p className="cia-muted">Annulé</p>
                        ) : (
                          <div className="cia-card-actions">
                            <button
                              className="primary"
                              disabled={st?.state === "running"}
                              onClick={() => runProposal(p)}
                            >
                              {st?.state === "running" ? <Loader2 size={15} className="cia-spin" /> : <Check size={15} />}
                              {st?.state === "error" ? "Réessayer" : p.confirmLabel}
                            </button>
                            <button onClick={() => setStatuses((s) => ({ ...s, [p.id]: { state: "dismissed" } }))}>
                              Annuler
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(m.proposals?.filter((p) => !statuses[p.id]).length ?? 0) > 1 && (
                    <button
                      className="cia-confirm-all"
                      onClick={async () => {
                        for (const p of m.proposals!.filter((x) => !statusesRef.current[x.id])) await runProposal(p);
                      }}
                    >
                      <Check size={15} aria-hidden /> Tout confirmer ({m.proposals!.filter((p) => !statuses[p.id]).length})
                    </button>
                  )}
                  {((m.links && m.links.length > 0) || (m.navigate && !onNavigate)) && (
                    <div className="cia-links">
                      {[
                        ...(m.links ?? []),
                        ...(m.navigate && !onNavigate
                          ? [
                              {
                                label: "Ouvrir dans le poste de travail",
                                href: `/dashboard?restaurant=${encodeURIComponent(restaurant)}&module=${encodeURIComponent(m.navigate)}`,
                              },
                            ]
                          : []),
                      ].map((l) => (
                        <Link key={l.href} href={l.href}>
                          {l.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && m.engine && (
                    <small className="cia-meta">
                      {m.engine === "llm" ? <Sparkles size={11} /> : <Zap size={11} />}
                      {m.engine === "llm" ? "IA avancée" : m.engine === "none" ? "Non compris" : "Réflexe"}
                      {" · "}
                      {m.credits ? `${m.credits} crédit${m.credits > 1 ? "s" : ""}` : "gratuit"}
                    </small>
                  )}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="cia-chips">
                      {m.suggestions.map((s) => (
                        <button key={s} onClick={() => send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="cia-msg assistant cia-typing" aria-label="STUDIO VOICE réfléchit">
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {interim && <div className="cia-msg user interim"><p>{interim}</p></div>}
            </div>
          )}

          {view === "chat" && (
            <form
              className="cia-input"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              {notice && <p className="cia-notice" role="status">{notice}</p>}
              {low && (
                <button
                  type="button"
                  className="cia-low"
                  onClick={() => {
                    void refresh();
                    setView("credits");
                  }}
                >
                  Plus que {state!.balance} crédits · recharger
                </button>
              )}
              <div className="cia-row">
                {voiceSupported && (
                  <button
                    type="button"
                    className={`cia-mic ${voice ? "on" : ""} ${listening ? "listening" : ""}`}
                    onClick={voice ? stopVoice : startVoice}
                    aria-pressed={voice}
                    aria-label={voice ? "Arrêter le mode vocal" : "Activer le mode vocal"}
                  >
                    {voice ? (speaking ? <Volume2 size={18} /> : <MicOff size={18} />) : <Mic size={18} />}
                  </button>
                )}
                <textarea
                  ref={field}
                  rows={1}
                  value={input}
                  maxLength={800}
                  placeholder={voice ? "Parlez, ou écrivez ici…" : "Demandez : « commande table 4… »"}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  aria-label="Votre demande à STUDIO VOICE"
                />
                <button type="submit" className="cia-send" disabled={busy || !input.trim()} aria-label="Envoyer">
                  {busy ? <Loader2 size={18} className="cia-spin" /> : <ArrowUp size={18} />}
                </button>
              </div>
              <small className="cia-foot">STUDIO VOICE prépare, vous confirmez. ⌘K pour l’ouvrir.</small>
            </form>
          )}
        </section>
      )}
    </>
  );
}
