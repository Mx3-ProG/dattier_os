"use client";
import type { SiteConfig } from "@/features/cms/schema";
import { ImageField } from "./fields";

type Vehicle = NonNullable<SiteConfig["collectionVehicles"]>[number];
export function CollectionVehiclesEditor({ config, update }: { config: SiteConfig; update: (mutate: (config: SiteConfig) => void, key?: string) => void }) {
  const vehicles = config.collectionVehicles ?? [];
  const change = (index: number, mutate: (vehicle: Vehicle) => void, key?: string) => update((next) => {
    if (next.collectionVehicles?.[index]) mutate(next.collectionVehicles[index]);
  }, key);
  return <section className="collection-vehicles-editor">
    <h4>Automobiles</h4>
    <p>Les fiches sont publiées dans « À vendre » ou « Déjà vendues » selon leur statut. Ajoutez vos propres photos et informations avant publication.</p>
    <button type="button" className="donut-button" onClick={() => update((next) => {
      next.collectionVehicles ??= [];
      next.collectionVehicles.push({ id: `vehicule-${crypto.randomUUID()}`, brand: "", model: "", priceCents: 0, year: new Date().getFullYear(), mileageKm: 0, location: "", description: "", images: [{ src: "/cms/racing/gallery1.jpg", alt: "Photo du véhicule à remplacer" }], status: "available" });
    })}>Ajouter un véhicule</button>
    {vehicles.map((vehicle, index) => <details key={vehicle.id} className="site-group" open={index === vehicles.length - 1}>
      <summary>{vehicle.brand || "Nouvelle marque"} {vehicle.model || "Nouveau modèle"} · {vehicle.status === "sold" ? "Vendu" : "À vendre"}</summary>
      <div className="collection-vehicle-fields">
        <label>Marque<input maxLength={80} value={vehicle.brand} onChange={(event) => change(index, (v) => { v.brand = event.target.value; }, `${vehicle.id}.brand`)} /></label>
        <label>Modèle<input maxLength={160} value={vehicle.model} onChange={(event) => change(index, (v) => { v.model = event.target.value; }, `${vehicle.id}.model`)} /></label>
        <label>Prix (€)<input type="number" min="0" max="20000000" step="1" value={vehicle.priceCents / 100} onChange={(event) => change(index, (v) => { v.priceCents = Math.round(Number(event.target.value) * 100); }, `${vehicle.id}.price`)} /></label>
        <label>Année<input type="number" min="1900" max="2100" value={vehicle.year} onChange={(event) => change(index, (v) => { v.year = Number(event.target.value); }, `${vehicle.id}.year`)} /></label>
        <label>Kilométrage<input type="number" min="0" max="2000000" value={vehicle.mileageKm} onChange={(event) => change(index, (v) => { v.mileageKm = Number(event.target.value); }, `${vehicle.id}.mileage`)} /></label>
        <label>Lieu de visite<input maxLength={120} value={vehicle.location} onChange={(event) => change(index, (v) => { v.location = event.target.value; }, `${vehicle.id}.location`)} /></label>
        <label>Statut<select value={vehicle.status} onChange={(event) => change(index, (v) => { v.status = event.target.value as Vehicle["status"]; })}><option value="available">À vendre</option><option value="sold">Déjà vendu</option></select></label>
        <label className="collection-vehicle-description">Description, équipements et historique<textarea rows={6} maxLength={5000} value={vehicle.description} onChange={(event) => change(index, (v) => { v.description = event.target.value; }, `${vehicle.id}.description`)} /></label>
        {vehicle.images.map((image, imageIndex) => <div key={imageIndex} className="collection-vehicle-image"><ImageField label={`Photo ${imageIndex + 1}`} value={image} disabled={false} onChange={(value) => change(index, (v) => { v.images[imageIndex] = value as Vehicle["images"][number]; })} />{vehicle.images.length > 1 && <button type="button" onClick={() => change(index, (v) => { v.images.splice(imageIndex, 1); })}>Retirer cette photo</button>}</div>)}
        {vehicle.images.length < 30 && <button type="button" onClick={() => change(index, (v) => { v.images.push({ src: "/cms/racing/gallery1.jpg", alt: "Photo du véhicule à remplacer" }); })}>Ajouter une photo</button>}
        <button type="button" onClick={() => update((next) => { next.collectionVehicles?.splice(index, 1); })}>Supprimer ce véhicule</button>
      </div>
    </details>)}
  </section>;
}
