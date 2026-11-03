"use client";
import { useEffect, useState } from "react";
import {
  businessTypes,
  redirectSchema,
  type Business,
  type SiteConfig,
} from "@/features/cms/schema";

type Update = (mutate: (c: SiteConfig) => void, key?: string) => void;

const typeLabels: Record<(typeof businessTypes)[number], string> = {
  Restaurant: "Restaurant",
  FastFoodRestaurant: "Restauration rapide",
  CafeOrCoffeeShop: "Café, salon de thé",
  Bakery: "Boulangerie, pâtisserie",
  BarOrPub: "Bar",
  IceCreamShop: "Glacier",
  FoodEstablishment: "Autre établissement de restauration",
  Store: "Commerce",
  LocalBusiness: "Autre établissement local",
  Organization: "Activité en ligne uniquement (aucun lieu ouvert au public)",
};
const emptyBusiness = (): Business => ({
  type: "Restaurant",
  cuisines: [],
  priceRange: "",
  sameAs: [],
  areaServed: [],
  geo: null,
});

/** Multi-line list edited as free text and committed on blur, so typing a new line is never lost. */
function LinesField({
  label,
  help,
  value,
  onCommit,
}: {
  label: string;
  help: string;
  value: string[];
  onCommit: (lines: string[]) => string | null;
}) {
  const [text, setText] = useState(value.join("\n")),
    [error, setError] = useState("");
  const joined = value.join("\n");
  useEffect(() => setText(joined), [joined]);
  return (
    <label className="site-field">
      {label}
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          setError(
            onCommit(
              text
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean),
            ) ?? "",
          )
        }
      />
      <small className={error ? "site-field-error" : "site-field-help"}>
        {error || help}
      </small>
    </label>
  );
}

const redirectLine = (r: { from: string; to: string; permanent: boolean }) =>
  `${r.from} ${r.permanent ? "->" : "~>"} ${r.to}`;

export function SeoIdentityFields({
  config,
  update,
}: {
  config: SiteConfig;
  update: Update;
}) {
  const business = config.business ?? emptyBusiness();
  const setBusiness = (patch: Partial<Business>, key?: string) =>
    update((c) => {
      c.business = { ...(c.business ?? emptyBusiness()), ...patch };
    }, key);
  const ai = config.seo.aiCrawlers ?? { search: true, training: true };
  const locale = config.seo.locale ?? { language: "fr", country: "FR" };
  const [geo, setGeo] = useState({
    lat: business.geo ? String(business.geo.latitude) : "",
    lng: business.geo ? String(business.geo.longitude) : "",
  });
  const commitGeo = (next: { lat: string; lng: string }) => {
    setGeo(next);
    const latitude = Number(next.lat.replace(",", ".")),
      longitude = Number(next.lng.replace(",", "."));
    if (!next.lat && !next.lng) setBusiness({ geo: null }, "biz.geo");
    else if (
      next.lat &&
      next.lng &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    )
      setBusiness({ geo: { latitude, longitude } }, "biz.geo");
  };
  return (
    <>
      <h4>Langue et pays</h4>
      <p className="muted">
        Langue réelle du contenu publié. Elle n’active aucune traduction : une
        version dans une autre langue reste à créer séparément.
      </p>
      <label className="site-field">
        Langue du site (ex. fr, en, es, fr-BE)
        <input
          value={locale.language}
          maxLength={6}
          onChange={(e) =>
            update((c) => {
              c.seo.locale = { ...locale, language: e.target.value.trim() };
            }, "seo.lang")
          }
        />
      </label>
      <label className="site-field">
        Pays principal (code à deux lettres, ex. FR, BE, CH)
        <input
          value={locale.country}
          maxLength={2}
          onChange={(e) =>
            update((c) => {
              c.seo.locale = {
                ...locale,
                country: e.target.value.trim().toUpperCase(),
              };
            }, "seo.country")
          }
        />
      </label>

      <h4>Identité de l’établissement</h4>
      <p className="muted">
        Utilisée dans les données structurées lues par les moteurs de recherche
        et les assistants IA. Ne renseignez que des informations exactes et
        visibles ou vérifiables ; laissez vide ce que vous ne savez pas.
      </p>
      <label className="site-field">
        Type d’activité
        <select
          value={business.type}
          onChange={(e) =>
            setBusiness({ type: e.target.value as Business["type"] })
          }
        >
          {businessTypes.map((t) => (
            <option key={t} value={t}>
              {typeLabels[t]}
            </option>
          ))}
        </select>
      </label>
      <LinesField
        label="Cuisines servies (une par ligne)"
        help="Ex. marocaine, méditerranéenne. 8 au maximum."
        value={business.cuisines}
        onCommit={(lines) => {
          if (lines.length > 8) return "8 cuisines au maximum.";
          if (lines.some((l) => l.length > 60)) return "60 caractères au maximum par ligne.";
          setBusiness({ cuisines: lines });
          return null;
        }}
      />
      <label className="site-field">
        Gamme de prix (ex. €, €€, €€€)
        <input
          value={business.priceRange}
          maxLength={10}
          onChange={(e) => setBusiness({ priceRange: e.target.value }, "biz.price")}
        />
      </label>
      <LinesField
        label="Profils officiels (une adresse https par ligne)"
        help="Réseaux sociaux et annuaires dont vous êtes propriétaire. Le lien Google Business des réglages boutique est ajouté automatiquement."
        value={business.sameAs}
        onCommit={(lines) => {
          const bad = lines.find((l) => !/^https:\/\/\S+$/.test(l) || l.length > 300);
          if (bad) return `Adresse https attendue : ${bad}`;
          if (lines.length > 10) return "10 profils au maximum.";
          setBusiness({ sameAs: lines });
          return null;
        }}
      />
      <LinesField
        label="Zones desservies (une par ligne, facultatif)"
        help="Utile pour la livraison ou une activité couvrant plusieurs villes ou pays."
        value={business.areaServed}
        onCommit={(lines) => {
          if (lines.length > 10) return "10 zones au maximum.";
          if (lines.some((l) => l.length > 80)) return "80 caractères au maximum par ligne.";
          setBusiness({ areaServed: lines });
          return null;
        }}
      />
      {business.type !== "Organization" && (
        <div className="site-field">
          Coordonnées GPS (facultatif)
          <input
            aria-label="Latitude"
            placeholder="Latitude, ex. 49.0890"
            inputMode="decimal"
            value={geo.lat}
            onChange={(e) => commitGeo({ ...geo, lat: e.target.value })}
          />
          <input
            aria-label="Longitude"
            placeholder="Longitude, ex. 0.5980"
            inputMode="decimal"
            value={geo.lng}
            onChange={(e) => commitGeo({ ...geo, lng: e.target.value })}
          />
        </div>
      )}

      <h4>Robots des assistants IA</h4>
      <p className="muted">
        Ces préférences sont publiées dans le fichier robots.txt de votre
        domaine. Les robots identifiés les respectent en principe, mais rien ne
        garantit qu’autoriser un robot fera apparaître le site dans les réponses
        d’une IA.
      </p>
      <label className="site-field">
        <input
          type="checkbox"
          checked={ai.search}
          onChange={(e) =>
            update((c) => {
              c.seo.aiCrawlers = { ...ai, search: e.target.checked };
            }, "seo.ai.search")
          }
        />
        Autoriser les robots de recherche des IA (réponses et citations : ChatGPT
        Search, Claude, Perplexity)
      </label>
      <label className="site-field">
        <input
          type="checkbox"
          checked={ai.training}
          onChange={(e) =>
            update((c) => {
              c.seo.aiCrawlers = { ...ai, training: e.target.checked };
            }, "seo.ai.training")
          }
        />
        Autoriser la collecte pour l’entraînement des modèles (GPTBot, ClaudeBot,
        Google-Extended, CCBot…)
      </label>

      <h4>Redirections</h4>
      <LinesField
        label="Anciennes adresses (une par ligne)"
        help="« /ancienne-page -> /nouvelle-page » redirection permanente ; « ~> » temporaire. Seules les adresses qui n’existent plus sont redirigées."
        value={(config.seo.redirects ?? []).map(redirectLine)}
        onCommit={(lines) => {
          const parsed: { from: string; to: string; permanent: boolean }[] = [];
          for (const line of lines) {
            const m = line.match(/^(\S+)\s*(->|~>)\s*(\S+)$/);
            const r = m && redirectSchema.safeParse({ from: m[1], to: m[3], permanent: m[2] === "->" });
            if (!r || !r.success)
              return `Ligne invalide : ${line}${r && !r.success ? ` (${r.error.issues[0].message})` : ""}`;
            parsed.push(r.data);
          }
          if (parsed.length > 100) return "100 redirections au maximum.";
          if (new Set(parsed.map((r) => r.from)).size !== parsed.length)
            return "Une même adresse est redirigée deux fois.";
          update((c) => {
            c.seo.redirects = parsed;
          });
          return null;
        }}
      />
    </>
  );
}
