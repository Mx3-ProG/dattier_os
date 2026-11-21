"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Menu, Phone, X } from "lucide-react";
import { fonts } from "@/features/cms/theme";
import { plain, type PlaceholderContext } from "@/features/cms/text";
import type { SiteConfig, Section } from "@/features/cms/schema";
import type { Settings, PublicReview } from "@/features/commerce/schema";
import { useTenantSite } from "./context";
import "./gta-home.css";

const chapters: Record<string, string> = {
  about: "La boutique",
  faq: "Au menu",
  cta: "Fêtes",
  reviews: "Avis",
  visit: "Horaires",
  map: "Accès",
};
const days = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

export function GtaSections({
  config,
  context,
  settings,
  reviews,
  preview,
  sample,
  sections,
  route,
  fallback,
}: {
  config: SiteConfig;
  context: PlaceholderContext;
  settings?: Settings;
  reviews: PublicReview[];
  preview: boolean;
  sample: boolean;
  sections: Section[];
  route: string;
  fallback: (section: Section) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState<{ src: string; alt: string }>();
  const [localTime, setLocalTime] = useState<{ day: number; time: string }>();
  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const update = () => {
      const parts = formatter.formatToParts(new Date());
      const part = (key: string) => parts.find((p) => p.type === key)?.value;
      setLocalTime({
        day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
          part("weekday") || "",
        ),
        time: part("hour") + ":" + part("minute"),
      });
    };
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const period = settings?.hours.find(
    (h) =>
      localTime &&
      h.day === localTime.day &&
      h.open <= localTime.time &&
      h.close > localTime.time,
  );
  const { href } = useTenantSite();
  const social = config.business?.sameAs ?? [];
  const name =
    config.branding.publicName.trim() || context.name || "Votre boutique";
  const phone = settings?.phone || context.phone;
  const address = settings?.address || context.address;
  const maps =
    settings?.googleBusinessUrl ||
    (address
      ? "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(name + " " + address)
      : "");
  const call = phone ? "tel:" + phone.replace(/[^0-9+]/g, "") : "";
  const heading = (value: string) => plain(value, { ...context, name });
  const photo = (image: { src: string; alt: string }, caption: string) => (
    <figure>
      <img src={image.src} alt={image.alt} loading="lazy" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
  const action = (url: string, label: string) =>
    url && label ? (
      <a className="gta-button" href={href(url.startsWith("#donuts-") && route && route !== "home" && !sections.some(s => "#donuts-"+s.type === url) ? "/"+url : url)}>
        {label}
      </a>
    ) : null;
  function content(s: Section) {
    switch (s.type) {
      case "hero":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h1>{heading(s.props.title)}</h1>
            <p>{heading(s.props.lead)}</p>
            <div className="gta-actions">
              {action(s.props.primary.href, s.props.primary.label)}
              {action(s.props.secondary.href, s.props.secondary.label)}
              {action(call, "Appeler la boutique")}
            </div>
            {photo(s.props.image, name)}
          </>
        );
      case "about":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h2>{heading(s.props.title)}</h2>
            {s.props.paragraphs.map((p, i) => (
              <p key={i}>{heading(p)}</p>
            ))}
            {action(s.props.cta.href, s.props.cta.label)}
            {photo(s.props.image, s.props.artCaption)}
          </>
        );
      case "marquee":
        return (
          <>
            <div className="gta-damier" aria-hidden="true" />
            <div className="gta-strip">
              {s.props.items.map((item, i) => (
                <span key={i}>{heading(item)}</span>
              ))}
            </div>
          </>
        );
      case "faq":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h2>{heading(s.props.title)}</h2>
            <div className="gta-menu">
              {s.props.items.map((item, i) => (
                <article key={i}>
                  <b className="gta-number">{String(i + 1).padStart(2, "0")}</b>
                  <h3>{item.question}</h3>
                  {item.answer.split("\n\n").length > 1 && (
                    <p>{item.answer.split("\n\n")[0]}</p>
                  )}
                  <ul>
                    {item.answer
                      .split("\n\n")
                      .at(-1)
                      ?.split("\n")
                      .filter(Boolean)
                      .map((x, j) => (
                        <li key={j}>{x}</li>
                      ))}
                  </ul>
                </article>
              ))}
            </div>
          </>
        );
      case "cta":
        return (
          <>
            <small>{s.props.kicker ?? "Commandes & traiteur"}</small>
            <h2>{heading(s.props.title)}</h2>
            <p>{s.props.text}</p>
            {action(s.props.link.href, s.props.link.label)}
          </>
        );
      case "gallery":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h2>{heading(s.props.title)}</h2>
            {s.props.intro && <p>{s.props.intro}</p>}
            <div className="gta-gallery">
              {s.props.images.map((img, i) => (
                <button
                  key={i}
                  className="gta-zoom"
                  aria-label={"Agrandir : " + img.alt}
                  onClick={() => {
                    setZoom(img);
                    dialog.current?.showModal();
                  }}
                >
                  {photo(img, img.alt)}
                </button>
              ))}
            </div>
          </>
        );
      case "reviews":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h2>{heading(s.props.title)}</h2>
            {s.props.text && <p>{s.props.text}</p>}
            {reviews.length > 0 && (
              <p className="gta-rating">
                <strong>
                  {(
                    reviews.reduce((sum, r) => sum + r.rating, 0) /
                    reviews.length
                  ).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                </strong>{" "}
                / 5 · {reviews.length} avis
              </p>
            )}
            {Boolean(s.props.highlights?.length) && (
              <div className="gta-review-themes">
                {s.props.highlights?.map((label, i) => (
                  <div key={i}>
                    <h3>{heading(label)}</h3>
                  </div>
                ))}
              </div>
            )}
            {reviews.slice(0, 3).map((r) => (
              <blockquote key={r.id}>
                <strong>
                  {r.customer_name} · {r.rating}/5
                </strong>
                <p>{r.body}</p>
              </blockquote>
            ))}
            {action(settings?.googleReviewUrl || maps, s.props.viewLabel)}
          </>
        );
      case "visit":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h2>{heading(s.props.title)}</h2>
            {sample && (
              <p>Horaires de démonstration, à confirmer en boutique.</p>
            )}
            {localTime && Boolean(settings?.hours.length) && (
              <p className="gta-status">
                {period
                  ? "Ouvert maintenant · jusqu’à " + period.close
                  : "Fermé actuellement"}
              </p>
            )}
            {settings?.hours.length ? (
              <dl>
                {[1, 2, 3, 4, 5, 6, 0].map((n) => (
                  <div key={n} data-today={localTime?.day === n}>
                    <dt>
                      {days[n]} {localTime?.day === n && <b>Aujourd’hui</b>}
                    </dt>
                    <dd>
                      {settings.hours
                        .filter((h) => h.day === n)
                        .map((h) => h.open + " – " + h.close)
                        .join(" / ") || "Fermé"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>Pour les horaires du jour, contactez la boutique.</p>
            )}
            {action(call, "Appeler la boutique")}
          </>
        );
      case "map":
        return (
          <>
            <small>{s.props.kicker}</small>
            <h2>{heading(s.props.title)}</h2>
            <p>{address}</p>
            {action(maps, s.props.buttonLabel)}
            <aside id="gta-contact">
              <small>{s.props.contactKicker ?? "Contact"}</small>
              <h2>
                {heading(
                  s.props.contactTitle ?? "Un petit creux ? Un coup de fil.",
                )}
              </h2>
              <p>
                {heading(
                  s.props.contactText ?? "Contactez directement la boutique.",
                )}
              </p>
              {action(call, phone || "")}
              {action(
                config.branding.email ? "mailto:" + config.branding.email : "",
                s.props.emailLabel ?? "Écrire à la boutique",
              )}
              {social.map((url) => (
                <a key={url} className="gta-button" href={url}>
                  {new URL(url).hostname.replace(/^www\./, "")}
                </a>
              ))}
            </aside>
          </>
        );
      default:
        return fallback(s);
    }
  }
  return (
    <>
      <dialog
        ref={dialog}
        className="gta-lightbox"
        aria-label={zoom?.alt || "Photo agrandie"}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <button
          aria-label="Fermer la photo"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        {zoom && <img src={zoom.src} alt={zoom.alt} />}
      </dialog>
      {sections.map((s) => (
        <section
          key={s.id}
          id={
            sections.find((item) => item.type === s.type)?.id === s.id
              ? "donuts-" + s.type
              : s.id
          }
          data-kind={s.type}
          data-cms-section={preview ? s.id : undefined}
        >
          <div className="gta-inner">{content(s)}</div>
        </section>
      ))}
    </>
  );
}

export function gtaThemeStyle(config: SiteConfig): CSSProperties {
  return {
    "--ink": config.theme.colors.text,
    "--pink": config.theme.colors.secondary,
    "--blue": config.theme.colors.accent,
    "--paper": config.theme.colors.background,
    "--head-font": fonts[config.theme.fonts.heading].stack,
    "--body-font": fonts[config.theme.fonts.body].stack,
    "--button-font": fonts[config.theme.fonts.button].stack,
  } as CSSProperties;
}
type FrameProps = {
  config: SiteConfig;
  context: PlaceholderContext;
  preview: boolean;
};
export function GtaHeader({
  config,
  context,
  preview,
  route,
  count,
}: { route: string; count: number } & FrameProps) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { href, shopEnabled } = useTenantSite();
  const home = !route || route === "home";
  const name =
    config.branding.publicName.trim() || context.name || "Votre boutique";
  const call = context.phone
    ? "tel:" + context.phone.replace(/[^0-9+]/g, "")
    : "";
  const menu = config.pages.home.sections.filter(
    (s) => s.visible && chapters[s.type],
  );
  const pages = Object.entries(config.pages).filter(
    ([key, page]) =>
      page.visible &&
      key !== "home" &&
      (page.kind === "content" ||
        page.kind === "custom" ||
        page.kind === "partial" ||
        key === "compte") &&
      (shopEnabled || key !== "commander"),
  );
  return (
    <header
      className="gta-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          menuButton.current?.focus();
        }
      }}
      data-cms-section={preview ? "site-header" : undefined}
    >
      <a href={home ? "#main" : href("/")} className="gta-brand">
        {config.branding.logo.src &&
        config.branding.logo.src !== "/cms/restaurant.svg" ? (
          <img className="gta-logo" src={config.branding.logo.src} alt="" />
        ) : (
          <i aria-hidden="true" />
        )}
        {name}
      </a>
      <button
        ref={menuButton}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        aria-controls="gta-nav"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      {call && (
        <a href={call} className="gta-phone" aria-label="Appeler la boutique">
          <Phone size={17} />
        </a>
      )}
      {shopEnabled && count > 0 && (
        <a className="gta-button" href={href("/checkout")}>
          Panier · {count}
        </a>
      )}
      {open && (
        <nav id="gta-nav">
          {menu.map((s) => (
            <a
              key={s.id}
              href={home ? "#donuts-" + s.type : href("/#donuts-" + s.type)}
              onClick={() => setOpen(false)}
            >
              {"kicker" in s.props && s.props.kicker
                ? s.props.kicker
                : chapters[s.type]}
            </a>
          ))}
          <div className="gta-page-links">
            {pages.map(([key, page]) => (
              <a
                key={key}
                aria-current={key === route ? "page" : undefined}
                href={href("/" + key)}
                onClick={() => setOpen(false)}
              >
                {page.title}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
export function GtaFooter({ config, context, preview }: FrameProps) {
  const { href } = useTenantSite();
  const name =
    config.branding.publicName.trim() || context.name || "Votre boutique";
  const { address, phone } = context;
  const call = phone ? "tel:" + phone.replace(/[^0-9+]/g, "") : "";
  const heading = (value: string) => plain(value, { ...context, name });
  return (
    <footer
      className="gta-footer"
      data-cms-section={preview ? "site-footer" : undefined}
    >
      <b>{name}</b>
      {config.footer.tagline && <p>{heading(config.footer.tagline)}</p>}
      <p>
        {address} {phone && <a href={call}>{phone}</a>}
      </p>
      {
        <div className="gta-legal">
          {Object.entries(config.pages)
            .filter(([, page]) => page.kind === "legal")
            .map(([key, page]) => (
              <a key={key} href={href("/" + key)}>
                {page.title}
              </a>
            ))}
          <button
            onClick={() =>
              window.dispatchEvent(new Event("donuts:cookie-settings"))
            }
          >
            Gérer mes cookies
          </button>
        </div>
      }
    </footer>
  );
}
