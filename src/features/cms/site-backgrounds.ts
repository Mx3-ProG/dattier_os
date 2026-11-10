import type { CSSProperties } from "react";
import { themedVisuals, type ThemedVisualId } from "./themed-visuals";

type BackgroundDefinition = { label: string; icon: string; base: string; tint: string; accent: string; tier: "free" | "six" | "nine" | "premium" | "deluxe" };

/** Identifiants, couleurs et motifs figés : aucune CSS libre ne vient des données du site. */
export const siteBackgrounds = {
  "xmas-candy": { label: "Sucres d’orge", icon: "🍭", base: "#fff8f2", tint: "#fce2da", accent: "#b82d42", tier: "free" },
  "xmas-trees": { label: "Forêt de sapins", icon: "🎄", base: "#f2f8f1", tint: "#dcebdc", accent: "#2b694a", tier: "free" },
  "xmas-santa": { label: "Pères Noël", icon: "🎅", base: "#fff8ed", tint: "#fbe6dd", accent: "#b7333d", tier: "free" },
  "xmas-gifts": { label: "Cadeaux sous le sapin", icon: "🎁", base: "#fef8ed", tint: "#f7dfcd", accent: "#ad4050", tier: "premium" },
  "xmas-elves": { label: "Atelier des lutins", icon: "🧝", base: "#f4f8ec", tint: "#dceacb", accent: "#4c744b", tier: "premium" },
  "xmas-gingerbread": { label: "Pain d’épices", icon: "🍪", base: "#fdf6ed", tint: "#efdbbf", accent: "#9b5c36", tier: "premium" },
  "xmas-aurora": { label: "Aurore boréale", icon: "✦", base: "#f0f8f6", tint: "#b9ddd9", accent: "#307b80", tier: "deluxe" },
  "xmas-village": { label: "Village lumineux", icon: "🏠", base: "#f6f5f0", tint: "#d8e1eb", accent: "#ae734c", tier: "deluxe" },
  "xmas-sleigh": { label: "Traîneau enchanté", icon: "🛷", base: "#f0f6fa", tint: "#cbdce9", accent: "#487d9e", tier: "deluxe" },
  "restaurant-table": { label: "Table de restaurant", icon: "🍽", base: "#fbf6ed", tint: "#e9dcc5", accent: "#8e583e", tier: "free" },
  "btp-plans": { label: "Plans de chantier", icon: "▤", base: "#f1f6f8", tint: "#d7e6ed", accent: "#477c91", tier: "free" },
  "salon-scissors": { label: "Ciseaux de salon", icon: "✂", base: "#f9f2f3", tint: "#edd9dc", accent: "#9f6675", tier: "free" },
  "bakery-wheat": { label: "Blé de boulangerie", icon: "🌾", base: "#fdf8eb", tint: "#f1e3bb", accent: "#a8813c", tier: "free" },
  "florist-bloom": { label: "Fleurs d’atelier", icon: "✿", base: "#f2f8f3", tint: "#d8eadc", accent: "#658f73", tier: "free" },
  "craft-tools": { label: "Outils d’artisan", icon: "⚒", base: "#f5f4f0", tint: "#e5e0d6", accent: "#746a59", tier: "free" },
  "restaurant-menu": { label: "Menu signature", icon: "✦", base: "#f9f1e6", tint: "#dfc8ab", accent: "#77513e", tier: "premium" },
  "btp-architecture": { label: "Architecture moderne", icon: "◫", base: "#ebf1f4", tint: "#c2d4dd", accent: "#416477", tier: "premium" },
  "salon-elegance": { label: "Salon élégant", icon: "✂", base: "#f8f0f2", tint: "#e1c6d2", accent: "#89566e", tier: "premium" },
  "commerce-display": { label: "Vitrine de commerce", icon: "◇", base: "#f4f7fa", tint: "#d7e1ec", accent: "#55769b", tier: "premium" },
  "wellness-botanical": { label: "Bien-être botanique", icon: "❀", base: "#f0f7f1", tint: "#ccdfd2", accent: "#4d7966", tier: "premium" },
  "artisan-workshop": { label: "Atelier créatif", icon: "✳", base: "#f8f3eb", tint: "#e5d7c2", accent: "#9b7955", tier: "premium" },
  ...Object.fromEntries(Object.entries(themedVisuals).map(([id, visual]) => [id, {
    label: visual.label, icon: visual.icon, base: visual.base, tint: visual.tint, accent: visual.accent,
    tier: visual.tier as BackgroundDefinition["tier"],
  }])) as Record<ThemedVisualId, BackgroundDefinition>,
} as const satisfies Record<string, BackgroundDefinition>;

export type SiteBackgroundId = keyof typeof siteBackgrounds;
export const isSiteBackground = (value: unknown): value is SiteBackgroundId =>
  typeof value === "string" && Object.hasOwn(siteBackgrounds, value);

function deluxeScene(id: SiteBackgroundId): string {
  const common = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" fill="none"><g opacity=".45"><circle cx="110" cy="90" r="3" fill="#fff"/><circle cx="420" cy="160" r="4" fill="#fff"/><circle cx="870" cy="95" r="3" fill="#fff"/><circle cx="1050" cy="265" r="4" fill="#fff"/></g>`;
  if (id === "space-wormhole") return `${common}<g stroke="#8c7fc4" opacity=".28" fill="none"><ellipse cx="600" cy="380" rx="390" ry="245" stroke-width="48"/><ellipse cx="600" cy="380" rx="280" ry="175" stroke-width="32"/><ellipse cx="600" cy="380" rx="170" ry="105" stroke-width="22"/></g><circle cx="600" cy="380" r="65" fill="#b8b6e1" opacity=".3"/></svg>`;
  if (id === "space-supernova") return `${common}<circle cx="600" cy="370" r="160" fill="#e8aa7c" opacity=".25"/><g stroke="#dc9a70" stroke-width="18" opacity=".24"><path d="M600 40v220M600 480v220M245 370h190M770 370h200M350 115l150 145M710 490l140 150M850 110L710 250M500 490L350 630"/></g><circle cx="600" cy="370" r="75" fill="#e5ad85" opacity=".35"/></svg>`;
  if (id === "space-cosmos") return `${common}<circle cx="860" cy="270" r="155" fill="#83acd3" opacity=".3"/><ellipse cx="860" cy="270" rx="275" ry="72" stroke="#7298c3" stroke-width="22" opacity=".34" transform="rotate(-20 860 270)"/><path d="M0 650Q320 570 600 700T1200 630" stroke="#8cadd0" stroke-width="75" opacity=".2"/></svg>`;
  if (id === "nature-biosphere") return `${common}<circle cx="600" cy="400" r="285" stroke="#78af8b" stroke-width="35" opacity=".33"/><path d="M325 410Q600 230 875 410M325 410Q600 590 875 410M600 120v560" stroke="#76aa88" stroke-width="22" opacity=".25"/><path d="M340 510Q440 400 510 475Q455 565 340 510M700 340Q800 220 880 320Q810 410 700 340" fill="#8cc6a0" opacity=".36"/></svg>`;
  if (id === "nature-coral") return `${common}<path d="M0 705Q300 600 600 710T1200 670V800H0Z" fill="#a2d6d5" opacity=".45"/><g stroke="#76b9ac" stroke-width="23" stroke-linecap="round" opacity=".4"><path d="M310 710V440m0 120-95-95m95 40 100-115M760 710V360m0 150-115-90m115 25 125-135"/></g><circle cx="890" cy="220" r="105" fill="#a5d8d6" opacity=".25"/></svg>`;
  if (id === "nature-rainforest") return `${common}<g fill="#8ac49b" opacity=".32"><circle cx="150" cy="150" r="160"/><circle cx="380" cy="70" r="185"/><circle cx="790" cy="80" r="195"/><circle cx="1070" cy="170" r="170"/></g><g stroke="#6ea385" stroke-width="30" opacity=".3"><path d="M160 800V320M380 800V300M800 800V280M1070 800V340"/></g><path d="M0 730Q600 580 1200 720V800H0Z" fill="#9dc9a8" opacity=".35"/></svg>`;
  if (id === "xmas-aurora") return `${common}<path d="M-80 260C180 40 450 400 760 100S1190 140 1300-50" stroke="#62bdb9" stroke-opacity=".26" stroke-width="175"/><path d="M-80 350C250 20 450 410 820 155S1140 290 1310 30" stroke="#9fd5ba" stroke-opacity=".38" stroke-width="75"/><path d="M0 730Q250 570 530 730T1200 710V800H0Z" fill="#9bc5c4" fill-opacity=".33"/></svg>`;
  if (id === "xmas-village") return `${common}<path d="M0 710Q260 570 520 690T1200 650V800H0Z" fill="#a6bbc9" fill-opacity=".5"/><g fill="#94a8ad" fill-opacity=".52"><path d="M165 660V525l90-75 90 75v135Z"/><path d="M520 680V500l120-95 120 95v180Z"/><path d="M920 650V545l85-72 85 72v105Z"/></g><g fill="#f3ca86" fill-opacity=".8"><rect x="215" y="555" width="25" height="30" rx="4"/><rect x="274" y="555" width="25" height="30" rx="4"/><rect x="585" y="545" width="32" height="38" rx="4"/><rect x="675" y="545" width="32" height="38" rx="4"/><rect x="978" y="565" width="26" height="31" rx="4"/></g></svg>`;
  return `${common}<path d="M0 690Q280 520 570 690T1200 620V800H0Z" fill="#b5d7e5" fill-opacity=".5"/><path d="M0 760Q400 620 750 730T1200 700V800H0Z" fill="#d8e8ec" fill-opacity=".7"/><g stroke="#7194aa" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity=".55"><path d="M760 565h170l-28 53H790l-30-53Z"/><path d="M790 618q-10 38-55 38m168-38q-8 38 34 38"/><path d="M790 562l-32-54m160 54 28-53"/></g><path d="M814 543q48-90 96 0" fill="#d57573" fill-opacity=".6"/></svg>`;
}

export function siteBackgroundStyle(id: SiteBackgroundId): CSSProperties {
  const { icon, base, tint, accent, tier } = siteBackgrounds[id];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><text x="15" y="52" font-family="Arial,sans-serif" font-size="29" fill="${accent}" fill-opacity=".28">${icon}</text><text x="86" y="122" font-family="Arial,sans-serif" font-size="24" fill="${accent}" fill-opacity=".2">${icon}</text><circle cx="119" cy="31" r="3" fill="${accent}" fill-opacity=".2"/><circle cx="60" cy="105" r="2" fill="${accent}" fill-opacity=".2"/></svg>`;
  const motif = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const layers: { image: string; size: string; repeat: string }[] = [];
  if (tier === "deluxe") {
    layers.push({ image: `radial-gradient(circle at 22% 18%, ${accent}55, transparent 38%)`, size: "auto", repeat: "no-repeat" });
    layers.push({ image: `radial-gradient(circle at 80% 75%, ${tint}bb, transparent 43%)`, size: "auto", repeat: "no-repeat" });
  } else if (tier === "nine") {
    layers.push({ image: `radial-gradient(circle at 75% 25%, ${accent}33, transparent 38%)`, size: "auto", repeat: "no-repeat" });
  }
  layers.push({ image: motif, size: "144px 144px", repeat: "repeat" });
  if (tier === "deluxe") layers.push({ image: `url("data:image/svg+xml,${encodeURIComponent(deluxeScene(id))}")`, size: "cover", repeat: "no-repeat" });
  if (tier === "premium" || tier === "six" || tier === "nine") layers.push({ image: `linear-gradient(135deg, ${base}, ${tint} 54%, ${base})`, size: "auto", repeat: "no-repeat" });
  layers.push({ image: `linear-gradient(160deg, ${base}, ${tint})`, size: "auto", repeat: "no-repeat" });
  return {
    backgroundColor: base,
    backgroundImage: layers.map((layer) => layer.image).join(", "),
    backgroundSize: layers.map((layer) => layer.size).join(", "),
    backgroundRepeat: layers.map((layer) => layer.repeat).join(", "),
  };
}
