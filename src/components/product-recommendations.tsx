/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { money } from "@/lib/domain";

type Item = {
  id: string;
  name: string;
  category: string;
  price: number;
  enabled: boolean;
  portions: number;
};

const available = (item: Item) => item.portions > 0;
const family = (name: string) =>
  name
    .trim()
    .toLocaleLowerCase("fr")
    .split(/[\s–-]+/)[0];

export function ProductRecommendations<T extends Item>({
  product,
  items,
  href,
  image,
  children,
}: {
  product: Item;
  items: T[];
  href: (item: T) => string;
  image: (item: T) => string | undefined;
  children?: React.ReactNode;
}) {
  const others = items.filter((item) => item.enabled && item.id !== product.id);
  const sameFamily = (item: T) => family(item.name) === family(product.name);
  const similar = others
    .filter((item) => item.category === product.category)
    .sort(
      (a, b) =>
        Number(sameFamily(b)) - Number(sameFamily(a)) ||
        Number(available(b)) - Number(available(a)),
    )
    .slice(0, 3);
  const complements = ["Entrées", "Plats", "Desserts", "Boissons"]
    .filter((category) => category !== product.category)
    .map((category) => {
      const options = others.filter((item) => item.category === category);
      return options.find(available) ?? options[0];
    })
    .filter((item): item is T => !!item)
    .slice(0, 3);

  function cards(list: T[]) {
    return (
      <ul className="product-suggestion-grid">
        {list.map((item) => {
          const src = image(item);
          return (
            <li key={item.id}>
              <Link href={href(item)} className="product-suggestion-card">
                {src && (
                  <img
                    src={src}
                    alt=""
                    width={480}
                    height={320}
                    loading="lazy"
                  />
                )}
                <div>
                  <span>{item.category}</span>
                  <h3>
                    {item.name} <ArrowUpRight size={17} aria-hidden />
                  </h3>
                  <p>
                    <strong>{money(item.price)}</strong>
                    {!available(item) && " · Rupture de stock"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {similar.length > 0 && (
        <section
          className="product-suggestions"
          aria-labelledby="similar-products"
        >
          <h2 id="similar-products">Vous aimerez aussi</h2>
          {cards(similar)}
        </section>
      )}
      {complements.length > 0 && (
        <section
          className="product-suggestions"
          aria-labelledby="complete-meal"
        >
          <h2 id="complete-meal">Et si on complétait le repas ?</h2>
          <p>
            Une entrée à partager, une boisson ou une touche sucrée selon la
            carte.
          </p>
          {cards(complements)}
          {children && (
            <div className="product-details-actions">{children}</div>
          )}
        </section>
      )}
    </>
  );
}
