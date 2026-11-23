"use client";
import { useState } from "react";
import { ArrowUpRight, Clock, MapPin, Package, Truck, Users } from "lucide-react";
import { SiteLink } from "./sections";
import type { SectionOf } from "@/features/cms/schema";
import { rich, type PlaceholderContext } from "@/features/cms/text";
import {
  availabilitySummary,
  deliveryDelay,
  deliveryModes,
  duration,
  euro,
  serviceLocations,
  type PublicOffers,
} from "@/features/offers/model";
import "./offer-sections.css";

type Common = { ctx: PlaceholderContext; attrs: Record<string, string>; offers: PublicOffers };
/** Seuls les liens internes, https, tél. et e-mail sont suivis. */
const safeHref = (href: string) => (/^(\/(?!\/)|https:|tel:|mailto:)/.test(href) ? href : "");
const pick = <T extends { category: string }>(items: T[], category: string, limit: number) =>
  items.filter((item) => !category.trim() || item.category.toLocaleLowerCase("fr") === category.trim().toLocaleLowerCase("fr"))
    .slice(0, limit > 0 ? limit : undefined);

function Head({ kicker, title, lead, ctx }: { kicker: string; title: string; lead: string; ctx: PlaceholderContext }) {
  return (
    <header className="site-offer-head">
      {kicker && <p className="donut-kicker">{rich(kicker, ctx)}</p>}
      <h2>{rich(title, ctx)}</h2>
      {lead && <p className="site-offer-lead">{rich(lead, ctx)}</p>}
    </header>
  );
}

export function OfferServicesSection({ props: p, ctx, attrs, offers }: Common & { props: SectionOf<"offerServices">["props"] }) {
  const services = pick(offers.services, p.category, p.limit);
  const href = safeHref(p.buttonLink);
  return (
    <section className="donut-section site-offer site-offer-services" {...attrs}>
      <Head {...p} ctx={ctx} />
      {services.length === 0 ? (
        <p className="site-offer-hint">Nos services seront bientôt présentés ici.</p>
      ) : (
        <div className="site-offer-grid">
          {services.map((service) => (
            <article key={service.id} className="site-offer-card">
              {service.images[0] && <img src={service.images[0]} alt={service.name} loading="lazy" />}
              <div className="site-offer-body">
                {service.category && <small>{service.category}</small>}
                <h3>{service.name}</h3>
                {service.summary && <p>{service.summary}</p>}
                <p className="site-offer-price">{service.priceFrom ? "À partir de " : ""}{euro(service.price)}</p>
                <ul className="site-offer-facts">
                  <li><Clock size={15} aria-hidden /> {duration(service.duration)}</li>
                  <li><MapPin size={15} aria-hidden /> {serviceLocations[service.location] ?? ""}</li>
                  {service.capacity > 1 && <li><Users size={15} aria-hidden /> Jusqu’à {service.capacity} personnes</li>}
                </ul>
                {(service.description || service.availability.length > 0) && (
                  <details>
                    <summary>Détails et disponibilités</summary>
                    {service.description && <p className="site-offer-description">{service.description}</p>}
                    {service.availability.length > 0 && (
                      <ul className="site-offer-hours">
                        {availabilitySummary(service.availability).map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    )}
                    {service.noticeHours > 0 && <p className="site-offer-hint">À réserver au moins {service.noticeHours} h à l’avance.</p>}
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {href && p.buttonLabel && <SiteLink link={{ label: p.buttonLabel, href }} className="donut-button dark"><ArrowUpRight size={18} /></SiteLink>}
    </section>
  );
}

function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return <div className="site-offer-placeholder" aria-hidden><Package size={36} /></div>;
  return (
    <div className="site-offer-gallery">
      <img src={images[index] ?? images[0]} alt={name} loading="lazy" />
      {images.length > 1 && (
        <div className="site-offer-dots">
          {images.map((url, i) => (
            <button key={url} type="button" aria-label={`Photo ${i + 1} de ${name}`} aria-pressed={i === index} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

const availabilityLabels = { available: "Disponible", low: "Bientôt épuisé", out: "Épuisé" } as const;

export function OfferProductsSection({ props: p, ctx, attrs, offers }: Common & { props: SectionOf<"offerProducts">["props"] }) {
  const products = pick(offers.products, p.category, p.limit);
  const href = safeHref(p.buttonLink);
  return (
    <section className="donut-section site-offer site-offer-products" {...attrs}>
      <Head {...p} ctx={ctx} />
      {products.length === 0 ? (
        <p className="site-offer-hint">Nos produits seront bientôt présentés ici.</p>
      ) : (
        <div className="site-offer-grid">
          {products.map((product) => (
            <article key={product.id} className="site-offer-card" data-availability={product.availability}>
              <ProductGallery images={product.images} name={product.name} />
              <div className="site-offer-body">
                {product.category && <small>{product.category}</small>}
                <h3>{product.name}</h3>
                {product.summary && <p>{product.summary}</p>}
                <p className="site-offer-price">
                  {euro(product.price)}
                  {product.compareAt !== null && product.compareAt > product.price && <s> {euro(product.compareAt)}</s>}
                </p>
                <ul className="site-offer-facts">
                  <li className={`site-offer-stock is-${product.availability}`}>{availabilityLabels[product.availability]}</li>
                  <li><Truck size={15} aria-hidden /> {deliveryDelay(product.deliveryMin, product.deliveryMax)}</li>
                  <li>{product.deliveryModes.map((mode) => deliveryModes[mode]).join(" · ")}</li>
                  {product.deliveryModes.some((mode) => mode !== "pickup") && product.shippingFee > 0 && (
                    <li>Frais de livraison : {euro(product.shippingFee)}</li>
                  )}
                </ul>
                {product.description && (
                  <details>
                    <summary>Description</summary>
                    <p className="site-offer-description">{product.description}</p>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {href && p.buttonLabel && <SiteLink link={{ label: p.buttonLabel, href }} className="donut-button dark"><ArrowUpRight size={18} /></SiteLink>}
    </section>
  );
}
