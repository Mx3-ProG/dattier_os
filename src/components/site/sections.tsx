"use client";
/* eslint-disable @next/next/no-img-element */
import { useTenantSite, TenantLink as Link } from "../cms-site/context";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import type { SectionOf } from "@/features/cms/schema";
import { rich, type PlaceholderContext } from "@/features/cms/text";
import type { Settings } from "@/features/commerce/schema";

/**
 * Sections added by the CMS. They only use the storefront's existing classes
 * and CSS variables, so they follow the theme like the original sections.
 */
type Common = { ctx: PlaceholderContext; attrs: Record<string, string> };

/** Internal links use the router; external ones open in a new tab. */
export function SiteLink({
  link,
  className,
  children,
}: {
  link: { label: string; href: string };
  className: string;
  children?: ReactNode;
}) {
  const { shopEnabled } = useTenantSite();
  if (
    !link.label ||
    !link.href ||
    (!shopEnabled && /^\/(commander|checkout|panier)([?#]|$)/.test(link.href))
  )
    return null;
  const external = /^(https:|tel:|mailto:)/.test(link.href);
  return external ? (
    <a
      className={className}
      href={link.href}
      {...(link.href.startsWith("https:")
        ? { target: "_blank", rel: "noreferrer" }
        : {})}
    >
      {link.label} {children}
    </a>
  ) : (
    <Link className={className} href={link.href}>
      {link.label} {children}
    </Link>
  );
}
const paragraphs = (body: string, ctx: PlaceholderContext) =>
  body
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p, i) => <p key={i}>{rich(p, ctx)}</p>);
const Heading = ({
  kicker,
  title,
  ctx,
}: {
  kicker: string;
  title: string;
  ctx: PlaceholderContext;
}) => (
  <>
    {kicker && <p className="donut-kicker">{rich(kicker, ctx)}</p>}
    {title && <h2>{rich(title, ctx)}</h2>}
  </>
);

export function TextBlock({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"textBlock">["props"] }) {
  return (
    <section
      className={`donut-section site-text ${p.align === "center" ? "is-center" : ""}`}
      {...attrs}
    >
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {paragraphs(p.body, ctx)}
    </section>
  );
}

export function TextImage({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"textImage">["props"] }) {
  return (
    <section
      className={`donut-section site-text-image ${p.imageSide === "left" ? "is-left" : ""}`}
      {...attrs}
    >
      <div>
        <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
        {paragraphs(p.body, ctx)}
        <SiteLink link={p.cta} className="donut-button">
          <ArrowUpRight size={18} />
        </SiteLink>
      </div>
      <img
        src={p.image.src}
        alt={p.image.alt}
        loading="lazy"
        decoding="async"
      />
    </section>
  );
}

/** With `pageTitle`, no kicker and no image, the markup is the original gallery page. */
export function Gallery({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"gallery">["props"] }) {
  const [open, setOpen] = useState<number | null>(null);
  const Title = p.pageTitle ? "h1" : "h2";
  return (
    <section className="donut-section" {...attrs}>
      {p.kicker && <p className="donut-kicker">{rich(p.kicker, ctx)}</p>}
      <Title>{rich(p.title, ctx)}</Title>
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      {p.images.length > 0 && (
        <div className="site-gallery">
          {p.images.map((image, i) => (
            <button
              key={`${image.src}-${i}`}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Agrandir : ${image.alt}`}
            >
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}
      {open !== null && p.images[open] && (
        <div
          className="site-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={p.images[open].alt}
          onClick={() => setOpen(null)}
        >
          <img src={p.images[open].src} alt={p.images[open].alt} />
          <button
            type="button"
            className="donut-button"
            onClick={() => setOpen(null)}
          >
            Fermer
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Uploaded videos load nothing until played (preload="none" + poster).
 * YouTube/Vimeo stay blocked until the visitor accepts external content,
 * exactly like the Google map.
 */
export function Video({
  props: p,
  ctx,
  attrs,
  externalAllowed,
}: Common & { props: SectionOf<"video">["props"]; externalAllowed: boolean }) {
  const s = p.source;
  const [play, setPlay] = useState(false);
  const embed =
    s.kind === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${s.id}?autoplay=1&rel=0`
      : s.kind === "vimeo"
        ? `https://player.vimeo.com/video/${s.id}?autoplay=1&dnt=1`
        : "";
  return (
    <section className="donut-section site-video" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div className="site-video-frame">
        {s.kind === "file" ? (
          s.src ? (
            <video
              controls
              preload="none"
              playsInline
              poster={s.poster || undefined}
              src={s.src}
            />
          ) : (
            <p className="site-video-empty">Aucune vidéo sélectionnée.</p>
          )
        ) : play && externalAllowed ? (
          <iframe
            src={embed}
            title={p.title || "Vidéo"}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <div
            className="site-video-gate"
            style={
              s.poster ? { backgroundImage: `url(${s.poster})` } : undefined
            }
          >
            {externalAllowed ? (
              <button
                type="button"
                className="donut-button"
                onClick={() => setPlay(true)}
              >
                <Play size={18} /> Lire la vidéo
              </button>
            ) : (
              <>
                <strong>
                  Vidéo {s.kind === "youtube" ? "YouTube" : "Vimeo"} bloquée.
                </strong>
                <p>Autorisez le contenu externe pour la lire.</p>
                <button
                  type="button"
                  className="donut-button"
                  onClick={() =>
                    window.dispatchEvent(new Event("donuts:cookie-settings"))
                  }
                >
                  Gérer mes préférences
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {p.caption && (
        <p className="site-video-caption">{rich(p.caption, ctx)}</p>
      )}
    </section>
  );
}

export function Faq({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"faq">["props"] }) {
  return (
    <section className="donut-section site-faq" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div>
        {p.items.map((item, i) => (
          <details key={i}>
            <summary>{rich(item.question, ctx)}</summary>
            {paragraphs(item.answer, ctx)}
          </details>
        ))}
      </div>
    </section>
  );
}

export function Cta({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"cta">["props"] }) {
  return (
    <section className={`donut-section site-cta tone-${p.tone}`} {...attrs}>
      <h2>{rich(p.title, ctx)}</h2>
      {p.text && <p>{rich(p.text, ctx)}</p>}
      <SiteLink
        link={p.link}
        className={`donut-button ${p.tone === "pink" ? "dark" : ""}`}
      >
        <ArrowUpRight size={18} />
      </SiteLink>
    </section>
  );
}

export function PromoBanner({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"promoBanner">["props"] }) {
  return (
    <aside className="site-promo" {...attrs}>
      <span>{rich(p.text, ctx)}</span>
      <SiteLink link={p.link} className="donut-text-link">
        <ArrowUpRight size={16} />
      </SiteLink>
    </aside>
  );
}

/** Live categories from the CRM (Boutique · horaires). */
export function Categories({
  props: p,
  ctx,
  attrs,
  categories,
}: Common & { props: SectionOf<"categories">["props"]; categories: string[] }) {
  return (
    <section className="donut-section site-categories" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div className="donut-categories">
        {categories.map((c) => (
          <Link key={c} href={`/carte?categorie=${encodeURIComponent(c)}`}>
            {c}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Live opening hours from the CRM. */
export function Hours({
  props: p,
  ctx,
  attrs,
  hours,
}: Common & {
  props: SectionOf<"hours">["props"];
  hours: Settings["hours"] | undefined;
}) {
  return (
    <section className="donut-section site-hours" {...attrs}>
      <div className="donut-hours">
        <h3>{rich(p.title, ctx)}</h3>
        {p.note && <p>{rich(p.note, ctx)}</p>}
        {[
          "Dimanche",
          "Lundi",
          "Mardi",
          "Mercredi",
          "Jeudi",
          "Vendredi",
          "Samedi",
        ].map((day, n) => (
          <div key={day}>
            <span>{day}</span>
            <b>
              {hours
                ?.filter((h) => h.day === n)
                .toSorted((a, b) => a.open.localeCompare(b.open))
                .map((h) => `${h.open} – ${h.close}`)
                .join(" / ") || "Fermé"}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}
