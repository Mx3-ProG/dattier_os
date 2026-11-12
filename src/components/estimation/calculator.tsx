"use client";
import { useState } from "react";
import { calculateEstimation, cents, type PublicEstimationItem } from "@/domain/estimation/model";
import "./estimation.css";

export function EstimationCalculator({
  items, fixedCostsCents, internal = false,
}: {
  items: readonly (PublicEstimationItem & { costCents?: number | null })[];
  fixedCostsCents?: number;
  internal?: boolean;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const result = calculateEstimation(items, quantities, internal ? fixedCostsCents : 0);
  return <div className="estimation-calculator">
    <div className="estimation-options">
      {items.map((item) => <label className={`estimation-option${item.featured ? " featured" : ""}`} key={item.id}>
        <span className="estimation-option-copy">
          {item.featured && <small>Mis en avant</small>}
          <strong>{item.name}</strong>
          <span>{item.kind === "service" ? "Service" : "Produit"} · {cents(item.priceCents)} / {item.unit}</span>
        </span>
        <span className="estimation-quantity">Quantité
          <input type="number" min="0" max={item.maxQuantity} step="1"
            value={quantities[item.id] ?? item.defaultQuantity}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 0 && value <= item.maxQuantity)
                setQuantities((current) => ({ ...current, [item.id]: value }));
            }} aria-label={`Quantité pour ${item.name}`} />
        </span>
      </label>)}
    </div>
    <div className="estimation-result" aria-live="polite">
      <span>{internal ? "Ventes estimées" : "Votre estimation indicative"}</span>
      <strong>{cents(result.revenueCents)}</strong>
      {internal ? <dl>
        <div><dt>Coûts directs</dt><dd>{result.directCostCents === null ? "Coûts à renseigner" : cents(result.directCostCents)}</dd></div>
        <div><dt>Autres coûts prévus</dt><dd>{cents(result.fixedCostsCents)}</dd></div>
        <div><dt>Marge estimée</dt><dd>{result.marginCents === null ? "Indisponible tant qu’un coût manque" : cents(result.marginCents)}</dd></div>
        <div><dt>Marge sur ventes</dt><dd>{result.marginRate === null ? "—" : `${result.marginRate.toLocaleString("fr-FR")} %`}</dd></div>
      </dl> : <p>Simulation sans engagement. Le prix final dépendra de la validation de l’établissement.</p>}
    </div>
  </div>;
}
