"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { SiteConfig } from "@/features/cms/schema";
import { TenantLink as Link } from "./context";

type Vehicle = NonNullable<SiteConfig["collectionVehicles"]>[number];
const euro = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
const number = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

export function CollectionCatalog({ vehicles, status, compact = false, open }: {
  vehicles: Vehicle[];
  status: Vehicle["status"];
  compact?: boolean;
  open: (vehicle: Vehicle) => void;
}) {
  const [brand, setBrand] = useState("Tout");
  const [search, setSearch] = useState("");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("Tous les lieux");
  const [sort, setSort] = useState("recent");
  const brands = [...new Set(vehicles.filter((v) => v.status === status).map((v) => v.brand))].sort();
  const locations = [...new Set(vehicles.filter((v) => v.status === status && v.location).map((v) => v.location))].sort();
  const results = vehicles.filter((vehicle) =>
    vehicle.status === status &&
    (brand === "Tout" || vehicle.brand === brand) &&
    (location === "Tous les lieux" || vehicle.location === location) &&
    `${vehicle.brand} ${vehicle.model}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) &&
    (status === "sold" || !budget || vehicle.priceCents <= Number(budget) * 100)
  ).sort((a, b) => sort === "price-asc" ? a.priceCents - b.priceCents : sort === "price-desc" ? b.priceCents - a.priceCents : sort === "name" ? `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, "fr") : b.year - a.year);
  return <section className="donut-section collection-inventory" aria-label={status === "sold" ? "Automobiles déjà vendues" : "Automobiles à vendre"}>
    <div className="donut-section-title"><div><p className="donut-kicker">{status === "sold" ? "ARCHIVES" : "LA COLLECTION"}</p><h2>{status === "sold" ? "Déjà vendues" : "Automobiles à vendre"}</h2></div></div>
    {!compact && <div className="collection-filters" role="search" aria-label="Filtrer les automobiles">
      <label>Marque<select value={brand} onChange={(event) => setBrand(event.target.value)}><option>Tout</option>{brands.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Lieu<select value={location} onChange={(event) => setLocation(event.target.value)}><option>Tous les lieux</option>{locations.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Rechercher<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Marque ou modèle" /></label>
      {status === "available" && <label>Budget maximum (€)<input type="number" min="0" step="1000" inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>}
      <label>Trier<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Année récente</option><option value="name">Nom</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option></select></label>
      <span role="status">{results.length} résultat(s)</span>
    </div>}
    <div className="collection-vehicle-grid">
      {(compact ? results.slice(0, 6) : results).map((vehicle) => <article className="collection-vehicle-card" key={vehicle.id}>
        <button type="button" onClick={() => open(vehicle)} aria-label={`Découvrir ${vehicle.brand} ${vehicle.model}`}>
          <img src={vehicle.images[0].src} alt={vehicle.images[0].alt} loading="lazy" />
          <span className="collection-vehicle-body"><small>{vehicle.brand}</small><strong>{vehicle.model}</strong><span className="collection-vehicle-facts"><span>{vehicle.year}</span><span>{number(vehicle.mileageKm)} km</span>{status === "available" && <b>{euro(vehicle.priceCents)}</b>}</span><span className="collection-vehicle-discover">Découvrir →</span></span>
        </button>
      </article>)}
    </div>
    {results.length === 0 && <p className="collection-empty">{vehicles.some((v) => v.status === status) ? "Aucun véhicule ne correspond à ces filtres." : status === "sold" ? "Les véhicules déjà vendus seront présentés ici." : "La collection sera bientôt présentée ici."}</p>}
  </section>;
}

export function CollectionVehicleDetails({ vehicle, back }: { vehicle: Vehicle; back: () => void }) {
  const [imageIndex, setImageIndex] = useState(0);
  return <article className="donut-section collection-vehicle-detail">
    <button type="button" className="collection-back" onClick={back}>← Retour à la collection</button>
    <div className="collection-detail-grid">
      <div><img className="collection-detail-main" src={vehicle.images[imageIndex].src} alt={vehicle.images[imageIndex].alt} />{vehicle.images.length > 1 && <div className="collection-detail-thumbs">{vehicle.images.map((image, index) => <button key={`${image.src}-${index}`} type="button" onClick={() => setImageIndex(index)} aria-label={`Afficher la photo ${index + 1}`} aria-pressed={index === imageIndex}><img src={image.src} alt="" /></button>)}</div>}</div>
      <div className="collection-detail-copy"><p className="donut-kicker">{vehicle.brand}</p><h1>{vehicle.model}</h1><strong className="collection-detail-price">{vehicle.status === "sold" ? "Déjà vendue" : euro(vehicle.priceCents)}</strong><dl><div><dt>Année</dt><dd>{vehicle.year}</dd></div><div><dt>Kilométrage</dt><dd>{number(vehicle.mileageKm)} km</dd></div>{vehicle.location && <div><dt>Visible à</dt><dd>{vehicle.location}</dd></div>}</dl><p>{vehicle.description}</p>{vehicle.status === "available" && <Link className="donut-button" href="/contact">Se renseigner sur ce véhicule</Link>}</div>
    </div>
  </article>;
}
