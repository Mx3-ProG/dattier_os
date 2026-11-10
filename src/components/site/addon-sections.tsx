"use client";
import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { SiteLink } from "./sections";
import type { SectionOf } from "@/features/cms/schema";
import { rich, type PlaceholderContext } from "@/features/cms/text";
import { allergenList } from "@/features/trade/definitions";
import { parseAllergens } from "@/features/trade/model";
import { postcodeZone, type SiteAddonData } from "@/features/cms/site-addons";
import "./addon-sections.css";

type Common = { ctx: PlaceholderContext; attrs: Record<string, string> };
const euro = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
/** Seuls les liens internes, https, tél. et e-mail sont suivis. */
const safeHref = (href: string) => (/^(\/(?!\/)|https:|tel:|mailto:)/.test(href) ? href : "");

function Head({ kicker, title, lead, ctx }: { kicker: string; title: string; lead: string; ctx: PlaceholderContext }) {
  return (
    <header className="site-addon-head">
      {kicker && <p className="donut-kicker">{rich(kicker, ctx)}</p>}
      <h2>{rich(title, ctx)}</h2>
      {lead && <p className="site-addon-lead">{rich(lead, ctx)}</p>}
    </header>
  );
}

export function EstimationSection({ props: p, ctx, attrs, enabled }: Common & { props: SectionOf<"estimation">["props"]; enabled: boolean }) {
  return (
    <section className="donut-section site-addon site-addon-estimation" {...attrs}>
      <Head {...p} ctx={ctx} />
      {enabled ? (
        <SiteLink link={{ label: p.buttonLabel || "Lancer l’estimation", href: "/estimation" }} className="donut-button dark"><ArrowUpRight size={18} /></SiteLink>
      ) : (
        <p className="site-addon-hint">Le simulateur sera disponible dès sa publication.</p>
      )}
    </section>
  );
}

export function LoyaltySection({ props: p, ctx, attrs }: Common & { props: SectionOf<"loyalty">["props"] }) {
  return (
    <section className="donut-section site-addon site-addon-loyalty" {...attrs}>
      <Head {...p} ctx={ctx} />
      {p.perks.length > 0 && (
        <ul className="site-addon-perks">
          {p.perks.map((perk) => (
            <li key={perk}><Check size={18} aria-hidden /> {rich(perk, ctx)}</li>
          ))}
        </ul>
      )}
      <SiteLink link={{ label: p.buttonLabel || "Rejoindre le programme", href: "/compte" }} className="donut-button dark"><ArrowUpRight size={18} /></SiteLink>
    </section>
  );
}

export function ReservationSection({ props: p, ctx, attrs, canReserve }: Common & { props: SectionOf<"reservation">["props"]; canReserve: boolean }) {
  return (
    <section className="donut-section site-addon site-addon-reservation" {...attrs}>
      <Head {...p} ctx={ctx} />
      {canReserve ? (
        <SiteLink link={{ label: p.buttonLabel || "Réserver une table", href: "/reservations" }} className="donut-button dark"><ArrowUpRight size={18} /></SiteLink>
      ) : (
        <p className="site-addon-hint">La réservation en ligne n’est pas encore ouverte.</p>
      )}
    </section>
  );
}

export function AllergensSection({ props: p, ctx, attrs, products }: Common & { props: SectionOf<"allergens">["props"]; products: { id: string; name: string; allergens: string }[] }) {
  const rows = products.map((product) => ({ ...product, ...parseAllergens(product.allergens ?? "", allergenList) }));
  return (
    <section className="donut-section site-addon site-addon-allergens" {...attrs}>
      <Head {...p} ctx={ctx} />
      {rows.length === 0 ? (
        <p className="site-addon-hint">La carte sera bientôt en ligne.</p>
      ) : (
        <div className="site-addon-table">
          <table>
            <caption className="site-addon-legend">● contient · ◐ traces possibles</caption>
            <thead>
              <tr>
                <th scope="col">Produit</th>
                {allergenList.map((allergen) => <th scope="col" key={allergen}><span>{allergen}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name}</th>
                  {allergenList.map((allergen) => {
                    const present = row.present.includes(allergen);
                    const trace = row.traces.includes(allergen);
                    return (
                      <td key={allergen} aria-label={`${allergen} : ${present ? "contient" : trace ? "traces possibles" : "absent"}`}>
                        {present ? "●" : trace ? "◐" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DeliverySection({ props: p, ctx, attrs, data }: Common & { props: SectionOf<"delivery">["props"]; data: SiteAddonData }) {
  const [postcode, setPostcode] = useState("");
  const [cart, setCart] = useState("");
  const zone = postcodeZone(data.shipping, postcode);
  const amount = Math.round(Number(cart.replace(",", ".")) * 100) || 0;
  const free = zone && zone.freeAbove && amount >= zone.freeAbove;
  return (
    <section className="donut-section site-addon site-addon-delivery" {...attrs}>
      <Head {...p} ctx={ctx} />
      {data.shipping.length === 0 ? (
        <p className="site-addon-hint">Les zones de livraison seront bientôt annoncées.</p>
      ) : (
        <>
          <ul className="site-addon-cards">
            {data.shipping.map((entry) => (
              <li key={entry.name}>
                <b>{entry.name}</b>
                <span>{entry.mode} · {entry.fee ? euro(entry.fee) : "offerte"}</span>
                {entry.freeAbove ? <small>Offerte dès {euro(entry.freeAbove)}</small> : null}
                {entry.delay !== null && entry.delay !== undefined && <small>Délai : {entry.delay} jour{entry.delay > 1 ? "s" : ""}</small>}
              </li>
            ))}
          </ul>
          {p.checker && (
            <div className="site-addon-checker">
              <label>Votre code postal<input inputMode="numeric" maxLength={10} value={postcode} onChange={(event) => setPostcode(event.target.value)} placeholder="75011" /></label>
              <label>Montant de votre panier (€)<input inputMode="decimal" maxLength={10} value={cart} onChange={(event) => setCart(event.target.value)} placeholder="40" /></label>
              <p role="status" className="site-addon-result">
                {!postcode.trim()
                  ? "Saisissez votre code postal pour vérifier la livraison."
                  : zone
                    ? `Bonne nouvelle : « ${zone.name} » (${zone.mode.toLowerCase()}) · ${free || !zone.fee ? "livraison offerte" : euro(zone.fee)}.`
                    : "Désolé, nous ne livrons pas encore cette adresse."}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function BundlesSection({ props: p, ctx, attrs, data }: Common & { props: SectionOf<"bundles">["props"]; data: SiteAddonData }) {
  return (
    <section className="donut-section site-addon site-addon-bundles" {...attrs}>
      <Head {...p} ctx={ctx} />
      {data.bundles.length === 0 ? (
        <p className="site-addon-hint">Nos prochaines formules arrivent bientôt.</p>
      ) : (
        <ul className="site-addon-cards">
          {data.bundles.map((bundle) => {
            const value = bundle.items.reduce((total, item) => total + item.price, 0);
            const saving = value - bundle.price;
            return (
              <li key={bundle.name}>
                <b>{bundle.name}</b>
                <span className="site-addon-price">{euro(bundle.price)}</span>
                <small>{bundle.items.map((item) => item.name).join(" + ")}</small>
                {saving > 0 && <em className="site-addon-saving">Vous économisez {euro(saving)}</em>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ServicesSection({ props: p, ctx, attrs, data }: Common & { props: SectionOf<"services">["props"]; data: SiteAddonData }) {
  const href = safeHref(p.buttonLink);
  return (
    <section className="donut-section site-addon site-addon-services" {...attrs}>
      <Head {...p} ctx={ctx} />
      {data.services.length === 0 ? (
        <p className="site-addon-hint">Notre carte des prestations arrive bientôt.</p>
      ) : (
        <ul className="site-addon-services-list">
          {data.services.map((service) => (
            <li key={service.name}>
              <span>{service.name}<small>{service.duration} min</small></span>
              <b>{euro(service.price)}</b>
            </li>
          ))}
        </ul>
      )}
      {href && <SiteLink link={{ label: p.buttonLabel || "Prendre rendez-vous", href }} className="donut-button dark"><ArrowUpRight size={18} /></SiteLink>}
    </section>
  );
}
