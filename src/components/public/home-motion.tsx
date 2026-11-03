"use client";
import Link from "next/link";
import { sitePath } from "./navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play, Users } from "lucide-react";

// Interactions de l'accueil, sans bibliothèque d'animation : un
// IntersectionObserver pour les apparitions, des variables CSS mises à
// jour dans requestAnimationFrame pour la parallaxe et les reflets.
// Tout est neutralisé quand l'utilisateur demande moins d'animations.

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Vidéo de fond du hero. Le vrai film du restaurant se dépose dans
// public/media/hero.mp4 (voir public/media/README.md) ; tant qu'il manque,
// le navigateur passe à la source suivante : un dégradé abstrait signalé
// comme provisoire, qui ne représente pas le restaurant.
const HERO_VIDEO = "/media/hero.mp4";
const HERO_PLACEHOLDER = "/media/hero-placeholder.mp4";

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false),
    [placeholder, setPlaceholder] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Sans animation souhaitée : on reste sur l'image fixe (poster).
    if (prefersReducedMotion()) v.pause();
  }, []);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  return (
    <>
      <div className="hero-media" data-scene-media aria-hidden>
        <video
          ref={ref}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/hero-poster.jpg"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedData={(e) =>
            setPlaceholder(
              e.currentTarget.currentSrc.endsWith(HERO_PLACEHOLDER),
            )
          }
        >
          <source src={HERO_VIDEO} type="video/mp4" />
          <source src={HERO_PLACEHOLDER} type="video/mp4" />
        </video>
      </div>
      <div className="hero-media-controls">
        {placeholder && (
          <span className="hero-placeholder-badge">
            Vidéo provisoire · le film du restaurant reste à fournir
          </span>
        )}
        <button
          type="button"
          className="hero-video-toggle"
          onClick={toggle}
          aria-label={
            playing ? "Mettre la vidéo en pause" : "Lire la vidéo de fond"
          }
        >
          {playing ? (
            <Pause size={16} aria-hidden />
          ) : (
            <Play size={16} aria-hidden />
          )}
        </button>
      </div>
    </>
  );
}

// Parallaxe légère et reflet qui suit le pointeur, pilotés par variables CSS.
export function useHeroMotion() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const p = Math.min(1, Math.max(0, window.scrollY / el.offsetHeight));
        el.style.setProperty("--hero-progress", p.toFixed(3));
      });
    };
    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty(
        "--mx",
        `${((e.clientX - r.left) / r.width) * 100}%`,
      );
      el.style.setProperty(
        "--my",
        `${((e.clientY - r.top) / r.height) * 100}%`,
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onPointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onPointer);
    };
  }, []);
  return ref;
}

// Choix rapide du nombre de couverts : mène au parcours /reservations
// avec le nombre déjà renseigné.
const quickGuests = [1, 2, 3, 4, 5, 6];

export function QuickBooking() {
  const [guests, setGuests] = useState(2);
  return (
    <div className="hero-quick" role="group" aria-labelledby="quick-title">
      <p id="quick-title" className="hero-quick-title">
        <Users size={16} aria-hidden /> Vous serez combien ?
      </p>
      <div className="hero-quick-chips">
        {quickGuests.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={guests === n}
            onClick={() => setGuests(n)}
          >
            {n}
            {n === quickGuests.length ? "+" : ""}
          </button>
        ))}
      </div>
      <Link
        className="btn primary"
        href={`${sitePath("/reservations")}?couverts=${guests}`}
      >
        Voir les tables libres <ArrowUpRight size={17} aria-hidden />
      </Link>
      <small>Calendrier, créneau, puis votre table sur le plan.</small>
    </div>
  );
}

// Apparitions au défilement : chaque [data-reveal] reçoit data-visible au
// moment où il entre dans l'écran, ce qui lance son animation CSS. Seuls les
// blocs encore sous l'écran au chargement sont observés : ce qui est déjà
// visible ne clignote pas.
export function ScrollReveal() {
  useEffect(() => {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const items = [
      ...document.querySelectorAll<HTMLElement>(".public-site [data-reveal]"),
    ].filter((el) => el.getBoundingClientRect().top > window.innerHeight);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute("data-visible", "");
        io.unobserve(e.target);
      }
    });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

// Carte qui s'incline vers le pointeur, avec un reflet chaud.
export function TiltCard({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const move = (e: React.PointerEvent<HTMLLIElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  };
  return (
    <li
      ref={ref}
      className={className}
      style={style}
      data-reveal
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {children}
    </li>
  );
}
