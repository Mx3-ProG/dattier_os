/* eslint-disable @next/next/no-img-element */
import type { ProductPageFields } from "@/lib/product-pages";
import { money } from "@/lib/domain";

export function ProductDetails({
  product,
  image,
  demo,
  children,
}: {
  product: ProductPageFields & {
    name: string;
    category: string;
    description: string;
    price: number;
    enabled: boolean;
    portions: number;
  };
  image?: string;
  demo?: boolean;
  children?: React.ReactNode;
}) {
  const example = demo && product.name === "Couscous agneau";
  return (
    <article className="product-details">
      {image && <img src={image} alt="" width={720} height={540} />}
      <div className="product-details-copy">
        <p>{product.category}</p>
        <h1>{product.name}</h1>
        <p>
          <strong>{money(product.price)}</strong> ·{" "}
          {product.enabled && product.portions > 0
            ? "Disponible"
            : "Indisponible actuellement"}
        </p>
        {demo && (
          <p>
            <strong>
              Fiche de démonstration. Informations à valider par le restaurant.
            </strong>
          </p>
        )}
        {example ? (
          <p>
            Une semoule légère, des morceaux d’agneau mijotés et un bouillon
            parfumé aux légumes.
          </p>
        ) : (
          product.description && <p>{product.description}</p>
        )}
        <h2>Composition</h2>
        <p>
          {product.public_composition ||
            (example
              ? "Exemple de recette : semoule de blé dur, agneau, carottes, courgettes, navets, pois chiches, oignon, bouillon et épices. Harissa à part."
              : "Composition détaillée à demander au restaurant.")}
        </p>
        <h2>Allergènes</h2>
        <p>
          {product.allergens ||
            (example
              ? "Dans cet exemple, la semoule de blé contient du gluten. La liste complète et les traces éventuelles restent à vérifier auprès du restaurant."
              : "Informations non renseignées. Demandez au restaurant avant de commander.")}
        </p>
        <div className="product-details-actions">{children}</div>
      </div>
    </article>
  );
}
