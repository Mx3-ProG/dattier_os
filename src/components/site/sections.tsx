"use client";
/* eslint-disable @next/next/no-img-element */
import { useTenantSite, TenantLink as Link } from "../cms-site/context";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import type { SectionOf } from "@/features/cms/schema";
import { rich, type PlaceholderContext } from "@/features/cms/text";
import { FollowButton } from "../cms-site/account/follow-button";
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


export function Newsletter({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"newsletter">["props"] }) {
  return (
    <section className="donut-section site-newsletter" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.text && <p>{rich(p.text, ctx)}</p>}
      <form
        className="site-newsletter-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="email"
          placeholder={p.placeholder}
          aria-label={p.placeholder}
        />
        <button type="submit" className="donut-button">
          {p.buttonLabel} <ArrowUpRight size={16} />
        </button>
      </form>
    </section>
  );
}

export function Team({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"team">["props"] }) {
  return (
    <section className="donut-section site-team" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      <div className="site-team-grid">
        {p.members.map((m, i) => (
          <article key={`${m.name}-${i}`} className="site-team-card">
            <img
              src={m.image.src}
              alt={m.image.alt}
              loading="lazy"
              decoding="async"
            />
            <h3>{rich(m.name, ctx)}</h3>
            <p className="site-team-role">{rich(m.role, ctx)}</p>
            {m.bio && <p>{rich(m.bio, ctx)}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

export function Stats({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"stats">["props"] }) {
  return (
    <section className="donut-section site-stats" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div className="site-stats-grid">
        {p.items.map((it, i) => (
          <div key={`${it.value}-${i}`} className="site-stat">
            <strong>{rich(it.value, ctx)}</strong>
            <span>{rich(it.label, ctx)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}


export function Partners({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"partners">["props"] }) {
  return (
    <section className="donut-section site-partners" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div className="site-partners-row">
        {p.logos.map((l, i) => (
          <a
            key={`${l.name}-${i}`}
            href={l.link.href || undefined}
            target={l.link.href.startsWith("https:") ? "_blank" : undefined}
            rel={l.link.href.startsWith("https:") ? "noreferrer" : undefined}
            className="site-partner"
          >
            <img src={l.image.src} alt={l.image.alt || l.name} loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  );
}

export function Timeline({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"timeline">["props"] }) {
  return (
    <section className="donut-section site-timeline" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      <ol className="site-timeline-list">
        {p.steps.map((st, i) => (
          <li key={`${st.title}-${i}`} className="site-timeline-step">
            <span className="site-timeline-num">{i + 1}</span>
            <div>
              <h3>{rich(st.title, ctx)}</h3>
              {st.text && <p>{rich(st.text, ctx)}</p>}
              {st.image?.src && (
                <img
                  src={st.image.src}
                  alt={st.image.alt}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Testimonials({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"testimonials">["props"] }) {
  return (
    <section className="donut-section site-testimonials" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div className="site-testimonials-grid">
        {p.items.map((it, i) => (
          <blockquote key={`${it.author}-${i}`} className="site-testimonial">
            <div className="site-testimonial-rating" aria-label={`${it.rating} sur 5`}>
              {"★".repeat(it.rating)}
            </div>
            <p>“{rich(it.quote, ctx)}”</p>
            <footer>
              {it.image?.src && (
                <img
                  src={it.image.src}
                  alt={it.image.alt || it.author}
                  loading="lazy"
                  decoding="async"
                />
              )}
              <div>
                <strong>{rich(it.author, ctx)}</strong>
                {it.role && <span>{rich(it.role, ctx)}</span>}
              </div>
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}


export function Pricing({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"pricing">["props"] }) {
  return (
    <section className="donut-section site-pricing" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      <div className="site-pricing-grid">
        {p.plans.map((pl, i) => (
          <article
            key={`${pl.name}-${i}`}
            className={`site-plan ${pl.highlight ? "is-highlight" : ""}`}
          >
            <h3>{rich(pl.name, ctx)}</h3>
            <div className="site-plan-price">
              <strong>{rich(pl.price, ctx)}</strong>
              {pl.period && <span>{rich(pl.period, ctx)}</span>}
            </div>
            <ul>
              {pl.features.map((f, j) => (
                <li key={j}>{rich(f, ctx)}</li>
              ))}
            </ul>
            <SiteLink link={pl.cta} className="donut-button">
              <ArrowUpRight size={16} />
            </SiteLink>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Urgency({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"urgency">["props"] }) {
  return (
    <section className="donut-section site-urgency" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.text && <p>{rich(p.text, ctx)}</p>}
      <div className="site-urgency-meta">
        {p.stock > 0 && (
          <span className="site-urgency-stock">
            {p.stock} {p.stockLabel}
          </span>
        )}
        {p.endDate && <span className="site-urgency-date">{rich(p.endDate, ctx)}</span>}
      </div>
      <SiteLink link={p.cta} className="donut-button">
        <ArrowUpRight size={16} />
      </SiteLink>
    </section>
  );
}

export function Hook({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"hook">["props"] }) {
  return (
    <aside className={`site-hook tone-${p.tone}`} {...attrs}>
      <span>{rich(p.text, ctx)}</span>
      <SiteLink link={p.link} className="donut-text-link">
        <ArrowUpRight size={16} />
      </SiteLink>
    </aside>
  );
}

export function ReviewForm({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"reviewForm">["props"] }) {
  return (
    <section className="donut-section site-review-form" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.text && <p>{rich(p.text, ctx)}</p>}
      <form className="site-review-form-fields" onSubmit={(e) => e.preventDefault()}>
        <input type="text" placeholder="Votre nom" aria-label="Votre nom" />
        <select aria-label="Note">
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
        <textarea rows={4} placeholder="Votre avis" aria-label="Votre avis" />
        <button type="submit" className="donut-button">
          {p.buttonLabel} <ArrowUpRight size={16} />
        </button>
      </form>
    </section>
  );
}


export function BlogList({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"blogList">["props"] }) {
  return (
    <section className="donut-section site-blog-list" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      <div className="site-blog-grid">
        {p.articles.map((a, i) => (
          <article key={`${a.title}-${i}`} className="site-blog-card">
            {a.image?.src && (
              <img
                src={a.image.src}
                alt={a.image.alt || a.title}
                loading="lazy"
                decoding="async"
              />
            )}
            <div>
              {a.date && <time>{rich(a.date, ctx)}</time>}
              <h3>{rich(a.title, ctx)}</h3>
              {a.excerpt && <p>{rich(a.excerpt, ctx)}</p>}
              <span className="site-blog-actions">
                {a.href && (
                  <SiteLink link={{ label: "Lire la suite", href: a.href }} className="donut-text-link">
                    <ArrowUpRight size={16} />
                  </SiteLink>
                )}
                <FollowButton
                  kind="article"
                  refId={a.href || a.title}
                  label={a.title}
                >
                  Suivre
                </FollowButton>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Article({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"article">["props"] }) {
  return (
    <article className="donut-section site-article" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      <div className="site-article-actions">
        <FollowButton
          kind="article"
          refId={p.title}
          label={p.title}
          progress={100}
        >
          Marquer comme lu
        </FollowButton>
      </div>
      {p.image?.src && (
        <img
          src={p.image.src}
          alt={p.image.alt}
          loading="lazy"
          decoding="async"
          className="site-article-image"
        />
      )}
      <div className="site-article-meta">
        {p.author && <span>{rich(p.author, ctx)}</span>}
        {p.date && <time>{rich(p.date, ctx)}</time>}
      </div>
      {paragraphs(p.body, ctx)}
    </article>
  );
}


export function Comparison({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"comparison">["props"] }) {
  return (
    <section className="donut-section site-comparison" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      <div className="site-comparison-wrap">
        <table className="site-comparison-table">
          <thead>
            <tr>
              <th></th>
              {p.columns.map((c, i) => (
                <th key={i}>{rich(c, ctx)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r, i) => (
              <tr key={i}>
                <th>{rich(r.label, ctx)}</th>
                {r.values.map((v, j) => (
                  <td key={j}>{rich(v, ctx)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReviewAdvanced({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"reviewAdvanced">["props"] }) {
  return (
    <section className="donut-section site-review-advanced" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.text && <p>{rich(p.text, ctx)}</p>}
      <form className="site-review-advanced-form" onSubmit={(e) => e.preventDefault()}>
        <input type="text" placeholder="Votre nom" aria-label="Votre nom" />
        {p.allowRating && (
          <select aria-label="Note">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        )}
        <textarea rows={4} placeholder="Votre avis" aria-label="Votre avis" />
        {p.allowPhoto && (
          <input type="file" accept="image/*" aria-label="Photo (optionnel)" />
        )}
        <button type="submit" className="donut-button">
          {p.buttonLabel} <ArrowUpRight size={16} />
        </button>
      </form>
    </section>
  );
}

export function FaqAdvanced({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"faqAdvanced">["props"] }) {
  return (
    <section className="donut-section site-faq-advanced" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.intro && <p>{rich(p.intro, ctx)}</p>}
      {p.categories.map((cat, i) => (
        <div key={`${cat.name}-${i}`} className="site-faq-category">
          <h3>{rich(cat.name, ctx)}</h3>
          <div>
            {cat.items.map((item, j) => (
              <details key={j}>
                <summary>{rich(item.question, ctx)}</summary>
                {paragraphs(item.answer, ctx)}
              </details>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}


export function Wheel({
  props: p,
  ctx,
  attrs,
}: Common & { props: SectionOf<"wheel">["props"] }) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const spin = () => {
    if (spinning || !p.prizes.length) return;
    setSpinning(true);
    setResult(null);
    const idx = Math.floor(Math.random() * p.prizes.length);
    const slice = 360 / p.prizes.length;
    const target = 360 * 6 + (360 - idx * slice - slice / 2);
    setRotation((r) => r + target);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(p.prizes[idx].label);
    }, 4200);
  };
  const gradient = p.prizes
    .map((pr, i) => {
      const slice = 100 / p.prizes.length;
      const start = i * slice;
      const end = (i + 1) * slice;
      return `${pr.color} ${start}% ${end}%`;
    })
    .join(", ");
  return (
    <section className="donut-section site-wheel" {...attrs}>
      <Heading kicker={p.kicker} title={p.title} ctx={ctx} />
      {p.text && <p>{rich(p.text, ctx)}</p>}
      <div className="site-wheel-stage">
        <div
          className="site-wheel-disk"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4s cubic-bezier(.17,.67,.12,.99)" : "none",
          }}
        >
          {p.prizes.map((pr, i) => {
            const slice = 360 / p.prizes.length;
            const angle = i * slice + slice / 2;
            return (
              <span
                key={i}
                className="site-wheel-label"
                style={{ transform: `rotate(${angle}deg) translate(0, -42%)` }}
              >
                {pr.label}
              </span>
            );
          })}
        </div>
        <div className="site-wheel-pointer" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="donut-button"
        onClick={spin}
        disabled={spinning}
      >
        {spinning ? "…" : p.buttonLabel}
      </button>
      {result && (
        <p className="site-wheel-result">
          {rich(p.resultText.replace("{prize}", result), ctx)}
        </p>
      )}
    </section>
  );
}
