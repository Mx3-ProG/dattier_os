# Créer un nouveau modèle de site (recette simple)

Un modèle = un objet dans `src/features/cms/templates.ts` + un SVG dans
`public/cms/templates/` + une entrée dans 3 fichiers. Temps estimé : 10 min.

## 1. Choisir un identifiant

Un slug court, en minuscules, sans accent : `pizzeria`, `coiffeur`, `loft`…

## 2. Ajouter l’id au schéma

Dans `src/features/cms/schema.ts`, ajouter l’id dans le `z.enum([...])` de
`presentationSchema.layout`.

## 3. Déclarer le modèle

Dans `src/features/cms/templates.ts`, ajouter un appel `template(...)` avant `];` :

```ts
template(
  "monid",            // id
  "Mon Modèle",       // nom affiché
  "Catégorie",        // sous-titre
  "Description courte.",
  false,              // premium (true/false)
  "#7c3028",          // couleur primaire
  "#fff8ef",          // fond
  "dmSerif",          // police de titre (voir fontIds)
  "Titre *accentué.*",// titre hero (étoiles = italique)
  ["hero", "featuredProducts", "about", "reviews", "visit", "map", "marquee"], // ordre
  // optionnel : couleur de texte et secondaire (pour fonds sombres)
  // "#fafafa", "#a1a1aa",
),
```

## 4. Créer l’illustration

Fichier `public/cms/templates/monid.svg` : SVG auto-contenu, < 12 Ko, sans script.
Voir les SVG existants comme référence.

## 5. Ajouter le clin d’œil

Dans `src/components/cms-site/template-extras.tsx`, ajouter une ligne dans
l’objet surprise :

```ts
monid: "Votre phrase secrète ✦",
```

## 6. Ajouter la composition CSS (optionnel mais recommandé)

Dans `src/components/cms-site/templates.css`, ajouter des règles
`.donut-site[data-template="monid"] …` pour le hero et les sections.

## 7. Mettre à jour la doc

`docs/platform/SITE_TEMPLATES.md` : ajouter le modèle à la liste.

## Vérification

```bash
npm test
npx tsc --noEmit
```

## Notes

- Les couleurs doivent passer les `contrastChecks` (ratio ≥ 3/4.5).
- Pour un fond sombre, passer `textColor` et `mutedColor` clairs.
- Le champ `order` réordonne les sections de l’accueil ; les sections
  absentes sont envoyées en fin.
- Premium = en-tête fixe, barre d’action, animations, clin d’œil.
```