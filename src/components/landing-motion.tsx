"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  BellRing,
  Boxes,
  CalendarDays,
  ChefHat,
  Coffee,
  Euro,
  Globe,
  LayoutGrid,
  ReceiptText,
  ShoppingBag,
  Users,
  Wine,
  X,
} from "lucide-react";

// Îlots interactifs de la page d'accueil. Tout reste décoratif ou
// navigationnel : aucune donnée n'est envoyée, rien n'est stocké.

type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

/* ------------------------------------------------------------------ */
/* Apparition au défilement                                            */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`lx-reveal ${className}`}
      data-shown={shown || undefined}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mot tournant du titre                                               */
/* ------------------------------------------------------------------ */

const words = ["restaurant", "salle", "cuisine", "bar", "service"];

export function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), 2400);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="lx-rotate" aria-label={words[0]}>
      <span key={words[i]} className="lx-rotate-word" aria-hidden>
        {words[i]}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Le passe : tickets qui avancent, sonnette (easter egg)              */
/* ------------------------------------------------------------------ */

type Moment = { label: string; tone: "midi" | "soir" | "nuit" | "matin" };

function moment(h: number): Moment {
  if (h >= 11 && h < 15) return { label: "Service du midi", tone: "midi" };
  if (h >= 18 && h < 23) return { label: "Service du soir", tone: "soir" };
  if (h >= 23 || h < 6) return { label: "Après la fermeture", tone: "nuit" };
  return { label: "Mise en place", tone: "matin" };
}

const dishes = [
  "Burrata, tomates anciennes",
  "Risotto aux cèpes",
  "Magret, jus au miel",
  "Tarte fine aux figues",
  "Daurade rôtie",
  "Mousse au chocolat",
  "Tartare de bœuf",
  "Velouté de potimarron",
];

type Ticket = { id: number; table: number; dish: string; lane: 0 | 1 | 2 };

const lanes: { label: string; icon: Icon }[] = [
  { label: "Salle", icon: LayoutGrid },
  { label: "Cuisine", icon: ChefHat },
  { label: "Prêt", icon: BellRing },
];

let seq = 0;
const make = (lane: 0 | 1 | 2): Ticket => ({
  id: ++seq,
  table: 1 + Math.floor(Math.random() * 14),
  dish: dishes[Math.floor(Math.random() * dishes.length)],
  lane,
});

export function ServicePass() {
  const [now, setNow] = useState<Moment | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rings, setRings] = useState(0);
  const [shout, setShout] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNow(moment(new Date().getHours()));
    setTickets([make(0), make(1), make(1), make(2)]);
  }, []);

  // Les tickets avancent seuls : salle → cuisine → prêt → servi.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setTickets((list) => {
        const next = list
          .map((k) => (k.lane === 2 ? null : { ...k, lane: (k.lane + 1) as 0 | 1 | 2 }))
          .filter(Boolean) as Ticket[];
        return [...next, make(0)].slice(-6);
      });
    }, 3200);
    return () => clearInterval(t);
  }, []);

  const ring = () => {
    const n = rings + 1;
    setRings(n);
    setTickets((list) => list.filter((k) => k.lane !== 2));
    setShout(
      n >= 7
        ? "Coup de feu ! Toute la brigade est sur le pont."
        : n >= 3
          ? `${n} envois. La salle vous adore.`
          : "Ça part !",
    );
    card.current?.animate(
      [
        { transform: "rotate(0)" },
        { transform: "rotate(-1.2deg)" },
        { transform: "rotate(1deg)" },
        { transform: "rotate(0)" },
      ],
      { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" },
    );
  };

  useEffect(() => {
    if (!shout) return;
    const t = setTimeout(() => setShout(null), 1800);
    return () => clearTimeout(t);
  }, [shout]);

  // Légère profondeur : la carte suit le pointeur.
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
  };
  const onLeave = () => {
    card.current?.style.setProperty("--rx", "0deg");
    card.current?.style.setProperty("--ry", "0deg");
  };

  return (
    <div className="lx-pass-wrap" onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="lx-shape lx-shape-a" aria-hidden />
      <span className="lx-shape lx-shape-b" aria-hidden />
      <span className="lx-shape lx-shape-c" aria-hidden />
      <div className="lx-pass" ref={card} data-tone={now?.tone}>
        <div className="lx-pass-top">
          <span className="lx-live" aria-hidden />
          <strong>{now?.label ?? "Service"}</strong>
          <span className="lx-pass-count" aria-live="polite">
            {rings ? `${rings} envoyé${rings > 1 ? "s" : ""}` : "en direct"}
          </span>
        </div>
        <div className="lx-lanes" aria-hidden>
          {lanes.map((l, i) => (
            <div className="lx-lane" key={l.label}>
              <span className="lx-lane-head">
                <l.icon size={14} aria-hidden /> {l.label}
              </span>
              {tickets
                .filter((k) => k.lane === i)
                .map((k) => (
                  <span className="lx-ticket" key={k.id} data-lane={i}>
                    <b>T{k.table}</b> {k.dish}
                  </span>
                ))}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="lx-bell"
          onClick={ring}
          aria-label="Sonner : envoyer les plats prêts"
          title="Psst… sonnez."
        >
          <BellRing size={18} aria-hidden />
          <span>Envoyer</span>
        </button>
        {shout && (
          <span className="lx-shout" role="status">
            {shout}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Explorateur de modules (puces façon Material)                       */
/* ------------------------------------------------------------------ */

export type Module = { key: string; title: string; text: string; detail: string };

const moduleIcons: Record<string, Icon> = {
  commandes: ReceiptText,
  salle: LayoutGrid,
  reservations: CalendarDays,
  stocks: Boxes,
  equipe: Users,
  site: Globe,
  boutique: ShoppingBag,
};

export function ModuleExplorer({ modules }: { modules: Module[] }) {
  const [active, setActive] = useState(0);
  const m = modules[active];
  const MIcon = moduleIcons[m.key] ?? ReceiptText;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n =
      (active + (e.key === "ArrowRight" ? 1 : -1) + modules.length) %
      modules.length;
    setActive(n);
    document.getElementById(`lx-tab-${modules[n].key}`)?.focus();
  };
  return (
    <div className="lx-explorer">
      <div className="lx-chips" role="tablist" aria-label="Modules" onKeyDown={onKey}>
        {modules.map((mod, i) => {
          const I = moduleIcons[mod.key] ?? ReceiptText;
          return (
            <button
              key={mod.key}
              id={`lx-tab-${mod.key}`}
              role="tab"
              type="button"
              aria-selected={i === active}
              aria-controls="lx-module-panel"
              tabIndex={i === active ? 0 : -1}
              className="lx-chip"
              onClick={() => setActive(i)}
            >
              <I size={16} aria-hidden /> {mod.title}
            </button>
          );
        })}
      </div>
      <div
        id="lx-module-panel"
        role="tabpanel"
        aria-labelledby={`lx-tab-${m.key}`}
        className="lx-panel"
        data-k={active % 4}
      >
        <div key={m.key} className="lx-panel-in">
          <span className="lx-panel-icon">
            <MIcon size={30} aria-hidden />
          </span>
          <div>
            <h3>{m.title}</h3>
            <p>{m.text}</p>
            <p className="lx-panel-detail">{m.detail}</p>
          </div>
          <span className="lx-panel-num" aria-hidden>
            {String(active + 1).padStart(2, "0")}
            <small>/{String(modules.length).padStart(2, "0")}</small>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Boutons flottants : remonter + choisir une offre                    */
/* ------------------------------------------------------------------ */

export function FloatingDock({ plans }: { plans: { name: string; quota: string }[] }) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) =>
      menu.current && !menu.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const top = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("contenu")?.focus({ preventScroll: true });
  };

  return (
    <div className="lx-dock" ref={menu}>
      <button
        type="button"
        className="lx-fab lx-fab-top"
        data-visible={visible || undefined}
        onClick={top}
        aria-label="Remonter en haut de la page"
        tabIndex={visible ? 0 : -1}
      >
        <ArrowUp size={20} aria-hidden />
      </button>
      {open && (
        <div className="lx-offer-menu" role="dialog" aria-label="Choisir une offre">
          <span className="lx-offer-title">Choisir une offre</span>
          {plans.map((p) => (
            <Link key={p.name} href="/platform" className="lx-offer-item">
              <strong>{p.name}</strong>
              <small>{p.quota}</small>
            </Link>
          ))}
          <a href="#offres" className="lx-offer-compare" onClick={() => setOpen(false)}>
            Comparer les offres
          </a>
        </div>
      )}
      <button
        type="button"
        className="lx-fab lx-fab-offer"
        aria-expanded={open}
        aria-label={open ? "Fermer le choix des offres" : "Choisir une offre"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={20} aria-hidden /> : <Euro size={20} aria-hidden />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Petits secrets : logo, code Konami, console                         */
/* ------------------------------------------------------------------ */

const konami = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function Secrets() {
  const [toast, setToast] = useState<{ icon: Icon; text: string } | null>(null);
  const clicks = useRef<number[]>([]);

  const show = useCallback((icon: Icon, text: string) => {
    setToast({ icon, text });
  }, []);

  useEffect(() => {
    console.log(
      "%cDattier OS%c\nEn cuisine, on goûte tout. Ici aussi : le code est ouvert → /source",
      "font:700 20px Georgia;color:#d9482b",
      "font:13px system-ui;color:#4d443d",
    );
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = k === konami[pos] ? pos + 1 : k === konami[0] ? 1 : 0;
      if (pos === konami.length) {
        pos = 0;
        document.documentElement.classList.toggle("lx-after-hours");
        show(Wine, "Mode après-service. Le chef vous sert un verre.");
      }
    };
    // Triple clic sur le logo : le café est offert.
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".landing-brand")) return;
      const t = Date.now();
      clicks.current = [...clicks.current.filter((c) => t - c < 900), t];
      if (clicks.current.length >= 3) {
        e.preventDefault();
        clicks.current = [];
        show(Coffee, "Le café est offert par la maison.");
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return toast ? (
    <div className="lx-toast" role="status">
      <toast.icon size={18} aria-hidden /> {toast.text}
    </div>
  ) : null;
}
