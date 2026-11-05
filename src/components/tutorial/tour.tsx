"use client";
/* Visite guidée interactive du poste de travail : un projecteur sur l’élément
   réel, une bulle d’explication, et des étapes où l’utilisateur agit lui-même.
   Le contenu vient de features/guide/content.ts, partagé avec la page /guide. */
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  GraduationCap,
  Lock,
  MousePointerClick,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { roleLabels } from "@/lib/permissions";
import type { Snapshot } from "@/lib/types";
import {
  chapterAllowed,
  chapterRoles,
  chapters,
  type Chapter,
  type TourStep,
} from "@/features/guide/content";
import { chapterIcons } from "./icons";
import "./tutorial.css";

type Progress = { done: string[]; seen: boolean };
type Run = { queue: string[]; chapter: number; step: number };
type Rect = { top: number; left: number; width: number; height: number };

const storageKey = (user: string) => `dattier-tour:v1:${user}`;
function readProgress(user: string): Progress {
  try {
    const raw = localStorage.getItem(storageKey(user));
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return { done: Array.isArray(p.done) ? p.done : [], seen: !!p.seen };
    }
  } catch {}
  return { done: [], seen: false };
}
function writeProgress(user: string, p: Progress) {
  try {
    localStorage.setItem(storageKey(user), JSON.stringify(p));
  } catch {}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
};
function findTarget(step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  return (
    [...document.querySelectorAll<HTMLElement>(step.target)].find(
      (el) =>
        (!step.text || (el.textContent || "").includes(step.text)) &&
        visible(el),
    ) || null
  );
}
const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

export function Tutorial({
  data,
  restaurant,
  modules,
  navigate,
  open,
  setOpen,
}: {
  data: Snapshot;
  restaurant: string;
  /** Modules du poste autorisés pour ce profil. */
  modules: string[];
  navigate: (module: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const user = data.user.id;
  const userRoles = data.user.roles ?? data.user.role;
  const available = chapters.filter((c) => chapterAllowed(c, userRoles));
  const [progress, setProgress] = useState<Progress>({ done: [], seen: true }),
    [welcome, setWelcome] = useState(false),
    [run, setRun] = useState<Run | null>(null),
    [finished, setFinished] = useState<string[] | null>(null);

  // Étapes réellement jouables pour ce profil (modules et liens de menu autorisés).
  const playable = useCallback(
    (c: Chapter) =>
      c.steps.filter((s) => {
        const wanted = s.module ? [s.module].flat() : [];
        if (wanted.length && !wanted.some((m) => modules.includes(m)))
          return false;
        const nav = s.target?.match(/^\[data-tour="nav-([a-z]+)"\]$/);
        return !nav || modules.includes(nav[1]);
      }),
    [modules],
  );

  const save = useCallback(
    (next: Progress) => {
      setProgress(next);
      writeProgress(user, next);
    },
    [user],
  );

  const start = useCallback(
    (queue: string[]) => {
      const ids = queue.filter((id) =>
        available.some((c) => c.id === id && playable(c).length),
      );
      if (!ids.length) return;
      setOpen(false);
      setWelcome(false);
      setFinished(null);
      setRun({ queue: ids, chapter: 0, step: 0 });
    },
    [available, playable, setOpen],
  );

  // Première visite : accueil ; ?tour=all|<parcours> lance directement la visite.
  const boot = useRef({ start, available });
  useEffect(() => {
    boot.current = { start, available };
  });
  useEffect(() => {
    const stored = readProgress(user);
    const asked = new URLSearchParams(window.location.search).get("tour");
    const timer = setTimeout(() => {
      setProgress(stored);
      if (asked) {
        const { start, available } = boot.current;
        start(asked === "all" ? available.map((c) => c.id) : [asked]);
        writeProgress(user, { ...stored, seen: true });
        // Un rechargement ne relance pas la visite.
        const url = new URL(window.location.href);
        url.searchParams.delete("tour");
        history.replaceState(history.state, "", url);
      } else if (!stored.seen) setWelcome(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [user]);

  const chapter = run
    ? available.find((c) => c.id === run.queue[run.chapter])
    : undefined;
  const steps = chapter ? playable(chapter) : [];
  const step = run ? steps[run.step] : undefined;

  const [rect, setRect] = useState<Rect | null>(null),
    [missing, setMissing] = useState(false),
    [ready, setReady] = useState(false);
  const target = useRef<HTMLElement | null>(null);
  // Le poste recrée ces valeurs à chaque rafraîchissement : l’étape ne doit pas repartir.
  const latest = useRef({ modules, navigate });
  useEffect(() => {
    latest.current = { modules, navigate };
  });

  const finishChapter = useCallback(() => {
    if (!run || !chapter) return;
    const done = [...new Set([...progress.done, chapter.id])];
    save({ done, seen: true });
    if (run.chapter + 1 < run.queue.length)
      setRun({ ...run, chapter: run.chapter + 1, step: 0 });
    else {
      setRun(null);
      setFinished(run.queue);
    }
  }, [run, chapter, progress.done, save]);

  const next = useCallback(() => {
    if (!run) return;
    if (run.step + 1 < steps.length) setRun({ ...run, step: run.step + 1 });
    else finishChapter();
  }, [run, steps.length, finishChapter]);

  const previous = useCallback(() => {
    if (!run) return;
    if (run.step > 0) setRun({ ...run, step: run.step - 1 });
    else if (run.chapter > 0) {
      const prev = available.find((c) => c.id === run.queue[run.chapter - 1]);
      setRun({
        ...run,
        chapter: run.chapter - 1,
        step: prev ? playable(prev).length - 1 : 0,
      });
    }
  }, [run, available, playable]);

  const stop = useCallback(() => {
    setRun(null);
    save({ ...progress, seen: true });
  }, [progress, save]);

  // Prépare l’étape : fermer une fenêtre, ouvrir le module, attendre l’élément.
  useEffect(() => {
    if (!step) return;
    let alive = true;
    setReady(false);
    setMissing(false);
    setRect(null);
    target.current = null;
    void (async () => {
      if (step.closeModal) {
        document
          .querySelector<HTMLElement>('.modal [aria-label="Fermer"]')
          ?.click();
        await sleep(160);
      }
      const wanted = step.module ? [step.module].flat() : [];
      const open = wanted.find((m) => latest.current.modules.includes(m));
      if (open) latest.current.navigate(open);
      let el: HTMLElement | null = null;
      if (step.target)
        for (let i = 0; i < 25 && alive && !el; i++) {
          el = findTarget(step);
          if (!el) await sleep(100);
        }
      if (!alive) return;
      target.current = el;
      if (el) {
        let r = el.getBoundingClientRect();
        // Sur téléphone la bulle occupe le bas de l’écran : l’élément remonte.
        const phone = innerWidth < 640;
        if (
          phone
            ? r.top < 60 || r.bottom > innerHeight * 0.5
            : r.top < 70 || r.bottom > innerHeight - 40
        ) {
          el.scrollIntoView({ block: phone ? "start" : "center" });
          r = el.getBoundingClientRect();
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      setMissing(!!step.target && !el);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [step]);

  // Suit la position de l’élément (défilement, fenêtres, rafraîchissements).
  useEffect(() => {
    if (!ready || !target.current) return;
    let frame = 0;
    const tick = () => {
      const el = target.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        const next = {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
        setRect((prev) => (sameRect(prev, next) ? prev : next));
      } else if (step) {
        // L’élément a été remplacé par un rafraîchissement : on le retrouve.
        target.current = findTarget(step);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [ready, step]);

  // Étapes interactives : le clic de l’utilisateur sur l’élément fait avancer.
  useEffect(() => {
    if (!ready || !step?.action) return;
    const onClick = (e: MouseEvent) => {
      const el = target.current;
      if (el && e.target instanceof Node && el.contains(e.target))
        setTimeout(next, 380);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ready, step, next]);

  // Clavier : flèches pour naviguer, Échap pour quitter.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (e.key === "Escape") stop();
      else if (!typing && e.key === "ArrowRight") next();
      else if (!typing && e.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, next, previous, stop]);

  return (
    <>
      {welcome && (
        <Welcome
          name={data.user.name}
          role={roleLabels[data.user.role]}
          count={available.length}
          minutes={available.reduce((s, c) => s + c.minutes, 0)}
          startAll={() => start(available.map((c) => c.id))}
          choose={() => {
            setWelcome(false);
            save({ ...progress, seen: true });
            setOpen(true);
          }}
          later={() => {
            setWelcome(false);
            save({ ...progress, seen: true });
          }}
        />
      )}
      {open && (
        <Center
          data={data}
          progress={progress}
          close={() => setOpen(false)}
          start={start}
          reset={() => save({ done: [], seen: true })}
          playable={playable}
        />
      )}
      {run && chapter && step && ready && (
        <Spotlight
          key={`${chapter.id}-${run.step}`}
          rect={rect}
          step={step}
          missing={missing}
          chapter={chapter}
          chapterIndex={run.chapter}
          chapterCount={run.queue.length}
          index={run.step}
          count={steps.length}
          nextChapter={available.find(
            (c) => c.id === run.queue[run.chapter + 1],
          )}
          restaurant={restaurant}
          canGoBack={run.step > 0 || run.chapter > 0}
          next={next}
          previous={previous}
          stop={stop}
          doIt={() => target.current?.click()}
        />
      )}
      {finished && (
        <Finished
          chapters={available.filter((c) => finished.includes(c.id))}
          remaining={available.filter((c) => !progress.done.includes(c.id))}
          close={() => setFinished(null)}
          openCenter={() => {
            setFinished(null);
            setOpen(true);
          }}
        />
      )}
    </>
  );
}

function Spotlight({
  rect,
  step,
  missing,
  chapter,
  chapterIndex,
  chapterCount,
  index,
  count,
  nextChapter,
  restaurant,
  canGoBack,
  next,
  previous,
  stop,
  doIt,
}: {
  rect: Rect | null;
  step: TourStep;
  missing: boolean;
  chapter: Chapter;
  chapterIndex: number;
  chapterCount: number;
  index: number;
  count: number;
  nextChapter?: Chapter;
  restaurant: string;
  canGoBack: boolean;
  next: () => void;
  previous: () => void;
  stop: () => void;
  doIt: () => void;
}) {
  const bubble = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(
    null,
  );
  const phoneTop =
    !!rect && rect.top + rect.height / 2 > (globalThis.innerHeight ?? 0) / 2;
  const last = index + 1 === count;
  const pad = 8;
  // Place la bulle sous, au-dessus, puis à côté de l’élément, dans l’écran.
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b) return;
    if (!rect || innerWidth < 640) {
      setPlace(null);
      return;
    }
    const w = b.offsetWidth,
      h = b.offsetHeight,
      gap = 16,
      m = 12;
    const clampX = (x: number) => Math.min(Math.max(m, x), innerWidth - w - m);
    const clampY = (y: number) => Math.min(Math.max(m, y), innerHeight - h - m);
    const centerX = rect.left + rect.width / 2 - w / 2;
    let top: number, left: number;
    if (rect.top + rect.height + pad + gap + h < innerHeight - m) {
      top = rect.top + rect.height + pad + gap;
      left = clampX(centerX);
    } else if (rect.top - pad - gap - h > m) {
      top = rect.top - pad - gap - h;
      left = clampX(centerX);
    } else if (rect.left + rect.width + pad + gap + w < innerWidth - m) {
      left = rect.left + rect.width + pad + gap;
      top = clampY(rect.top);
    } else if (rect.left - pad - gap - w > m) {
      left = rect.left - pad - gap - w;
      top = clampY(rect.top);
    } else {
      // Élément plus grand que l’écran : la bulle se pose dans un coin.
      left = innerWidth - w - m * 2;
      top = innerHeight - h - m * 2;
    }
    setPlace((p) =>
      p && p.top === top && p.left === left ? p : { top, left },
    );
  }, [rect]);
  const Icon = chapterIcons[chapter.icon] || Sparkles;
  const href = step.link?.href.replace("{restaurant}", restaurant);
  return (
    <div className="tour-layer" data-tour-layer>
      {rect ? (
        <>
          <svg className="tour-mask" aria-hidden>
            <defs>
              <mask id="tour-cut">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  className="tour-cut"
                  style={{
                    x: rect.left - pad,
                    y: rect.top - pad,
                    width: rect.width + pad * 2,
                    height: rect.height + pad * 2,
                  }}
                  rx="12"
                  fill="black"
                />
              </mask>
            </defs>
            <rect width="100%" height="100%" mask="url(#tour-cut)" />
          </svg>
          <div
            className="tour-hole"
            style={{
              top: rect.top - pad,
              left: rect.left - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2,
            }}
          />
        </>
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={bubble}
        role="dialog"
        aria-live="polite"
        aria-labelledby="tour-title"
        className={`tour-bubble ${rect ? "anchored" : "centered"} ${place ? "placed" : ""} ${phoneTop ? "phone-top" : ""}`}
        style={place ? { top: place.top, left: place.left } : undefined}
      >
        <header>
          <span className="tour-chapter">
            <Icon size={14} />
            {chapterCount > 1
              ? `Parcours ${chapterIndex + 1}/${chapterCount} · `
              : ""}
            {chapter.title}
          </span>
          <button aria-label="Quitter la visite" onClick={stop}>
            <X size={17} />
          </button>
        </header>
        <div className="tour-steps" aria-hidden>
          {Array.from({ length: count }, (_, i) => (
            <i
              key={i}
              className={i < index ? "done" : i === index ? "on" : ""}
            />
          ))}
        </div>
        <small className="tour-count">
          Étape {index + 1} sur {count}
        </small>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        {step.action && !missing && (
          <div className="tour-action">
            <MousePointerClick size={17} />
            <span>{step.action}</span>
          </div>
        )}
        {missing && (
          <div className="tour-missing">
            {step.fallback ||
              "Cet élément n’est pas affiché pour le moment ; l’explication reste valable."}
          </div>
        )}
        {href && step.link && (
          <Link
            className="tour-link"
            href={href}
            target={href.startsWith("/r/") ? "_blank" : undefined}
          >
            {step.link.label} <ArrowRight size={14} />
          </Link>
        )}
        <footer>
          <button
            className="tour-ghost"
            onClick={previous}
            disabled={!canGoBack}
          >
            <ArrowLeft size={15} /> Précédent
          </button>
          <div>
            {step.autoClick && !missing && (
              <button className="tour-secondary" onClick={doIt}>
                Le faire pour moi
              </button>
            )}
            <button className="tour-primary" onClick={next} autoFocus>
              {last
                ? nextChapter
                  ? `Suite : ${nextChapter.title}`
                  : "Terminer"
                : step.action && !missing
                  ? "Passer"
                  : "Suivant"}
              {last && !nextChapter ? (
                <Check size={15} />
              ) : (
                <ArrowRight size={15} />
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Welcome({
  name,
  role,
  count,
  minutes,
  startAll,
  choose,
  later,
}: {
  name: string;
  role: string;
  count: number;
  minutes: number;
  startAll: () => void;
  choose: () => void;
  later: () => void;
}) {
  return (
    <div className="tour-modal-wrap" data-tour-layer>
      <div
        className="tour-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-welcome-title"
      >
        <span className="tour-welcome-badge">
          <GraduationCap size={26} />
        </span>
        <span className="eyebrow">Visite guidée</span>
        <h2 id="tour-welcome-title">Bienvenue, {name}.</h2>
        <p>
          Vous êtes connecté en tant que <b>{role}</b>. Nous avons préparé{" "}
          {count} parcours interactifs adaptés à votre métier : vous suivez le
          service sur les vrais écrans, et vous pouvez agir vous-même à chaque
          étape.
        </p>
        <ul>
          <li>
            <Check size={15} /> Environ {minutes} minutes pour tout voir
          </li>
          <li>
            <Check size={15} /> Reprenez quand vous voulez depuis le bouton
            Guide
          </li>
          <li>
            <Check size={15} /> Progression mémorisée sur cet appareil
          </li>
        </ul>
        <div className="tour-welcome-actions">
          <button className="tour-primary" onClick={startAll} autoFocus>
            <Play size={15} /> Démarrer la visite complète
          </button>
          <button className="tour-secondary" onClick={choose}>
            Choisir un parcours
          </button>
        </div>
        <button className="tour-later" onClick={later}>
          Plus tard
        </button>
      </div>
    </div>
  );
}

function Center({
  data,
  progress,
  close,
  start,
  reset,
  playable,
}: {
  data: Snapshot;
  progress: Progress;
  close: () => void;
  start: (queue: string[]) => void;
  reset: () => void;
  playable: (c: Chapter) => TourStep[];
}) {
  const userRoles = data.user.roles ?? data.user.role;
  const open = chapters.filter(
    (c) => chapterAllowed(c, userRoles) && playable(c).length,
  );
  const done = open.filter((c) => progress.done.includes(c.id)).length;
  const percent = open.length ? Math.round((done / open.length) * 100) : 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="tour-center-wrap" data-tour-layer>
      <button
        className="tour-center-scrim"
        aria-label="Fermer le guide"
        onClick={close}
      />
      <aside
        className="tour-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-center-title"
      >
        <header>
          <div>
            <span className="eyebrow">Centre d’apprentissage</span>
            <h2 id="tour-center-title">Apprendre atacuisine</h2>
          </div>
          <button aria-label="Fermer le guide" onClick={close}>
            <X size={19} />
          </button>
        </header>
        <div className="tour-progress">
          <div>
            <b>
              {done} / {open.length} parcours terminés
            </b>
            <span>{percent} %</span>
          </div>
          <span className="tour-bar">
            <i style={{ width: `${percent}%` }} />
          </span>
          <small>
            Profil {roleLabels[data.user.role]} · {open.length} parcours
            disponibles sur {chapters.length}
          </small>
        </div>
        <div className="tour-center-actions">
          <button
            className="tour-primary"
            onClick={() =>
              start(
                open
                  .filter((c) => !progress.done.includes(c.id))
                  .map((c) => c.id).length
                  ? open
                      .filter((c) => !progress.done.includes(c.id))
                      .map((c) => c.id)
                  : open.map((c) => c.id),
              )
            }
          >
            <Play size={15} />
            {done && done < open.length
              ? "Reprendre la visite"
              : "Visite complète"}
          </button>
          <Link className="tour-secondary" href="/guide" target="_blank">
            <BookOpenText size={15} /> Guide écrit
          </Link>
        </div>
        <ol className="tour-chapters">
          {chapters.map((c) => {
            const Icon = chapterIcons[c.icon] || Sparkles;
            const allowed = open.includes(c);
            const finished = progress.done.includes(c.id);
            return (
              <li key={c.id} className={allowed ? "" : "locked"}>
                <button
                  disabled={!allowed}
                  onClick={() => start([c.id])}
                  aria-label={`${allowed ? "Lancer" : "Verrouillé"} : ${c.title}`}
                >
                  <span
                    className={`tour-chapter-icon ${finished ? "done" : ""}`}
                  >
                    {finished ? <Check size={17} /> : <Icon size={17} />}
                  </span>
                  <span className="tour-chapter-text">
                    <b>{c.title}</b>
                    <small>{c.summary}</small>
                    <em>
                      {allowed ? (
                        <>
                          {playable(c).length} étapes · ~{c.minutes} min
                          {finished ? " · terminé" : ""}
                        </>
                      ) : (
                        <>
                          <Lock size={11} /> Profils :{" "}
                          {chapterRoles(c).join(", ")}
                        </>
                      )}
                    </em>
                  </span>
                  {allowed && <ArrowRight size={16} className="tour-go" />}
                </button>
              </li>
            );
          })}
        </ol>
        <footer>
          {data.demo && (
            <Link href="/demo">
              Changer de profil pour débloquer d’autres parcours →
            </Link>
          )}
          {!!progress.done.length && (
            <button onClick={reset}>
              <RotateCcw size={13} /> Réinitialiser ma progression
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function Finished({
  chapters: done,
  remaining,
  close,
  openCenter,
}: {
  chapters: Chapter[];
  remaining: Chapter[];
  close: () => void;
  openCenter: () => void;
}) {
  return (
    <div className="tour-modal-wrap" data-tour-layer>
      <div
        className="tour-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-finished-title"
      >
        <span className="tour-welcome-badge done">
          <Check size={26} />
        </span>
        <span className="eyebrow">Bravo</span>
        <h2 id="tour-finished-title">
          {done.length > 1
            ? `${done.length} parcours terminés.`
            : `« ${done[0]?.title} » terminé.`}
        </h2>
        <p>
          {remaining.length
            ? `Il vous reste ${remaining.length} parcours à découvrir pour votre profil.`
            : "Vous avez fait le tour de tous les parcours disponibles pour votre profil."}
        </p>
        <div className="tour-welcome-actions">
          {remaining.length ? (
            <button className="tour-primary" onClick={openCenter} autoFocus>
              Voir les parcours restants
            </button>
          ) : (
            <Link className="tour-primary" href="/guide" target="_blank">
              <BookOpenText size={15} /> Lire le guide complet
            </Link>
          )}
          <button className="tour-secondary" onClick={close}>
            Retour au service
          </button>
        </div>
      </div>
    </div>
  );
}
