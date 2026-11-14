/* FLUX avec l’IA générative (Claude, SDK officiel Anthropic). Une seule
   demande, un seul outil : le modèle rend un plan de site complet, que le
   serveur nettoie (normalizePlan) puis applique (build.ts). Le modèle ne
   touche jamais aux données : l’utilisateur confirme avant enregistrement. */
import Anthropic from "@anthropic-ai/sdk";
import { fontIds } from "@/features/cms/schema";
import { llmModel } from "../llm";
import { providerCostEur, type TokenUsage } from "../pricing";
import { fluxAddonSections, fluxGoals, fluxLayouts, normalizePlan, type FluxPlan } from "./plan";

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 }));

const object = (properties: Record<string, unknown>): Anthropic.Beta.BetaTool.InputSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const strings = (description: string) => ({ type: "array", items: { type: "string" }, description });
const optionalId = (description: string) => ({ type: "string", description: `${description} Vide si aucun.` });

export const buildSiteTool: Anthropic.Beta.BetaTool = {
  name: "build_site",
  description:
    "Construit le site complet en une fois : identité visuelle, textes de la page d’accueil, questions fréquentes, référencement, et propose des add-ons utiles. À appeler une seule fois, avec tous les champs remplis.",
  strict: true,
  input_schema: object({
    reply: str("Message court (2 à 3 phrases) à l’utilisateur : ce que vous avez construit et pourquoi. Vouvoiement."),
    layout: { type: "string", enum: [...fluxLayouts], description: "bistrot = chaleureux, jardin = lumineux et naturel, comptoir = vente directe et typographie franche, pause = doux et gourmand." },
    goal: { type: "string", enum: [...fluxGoals], description: "Action principale du site : order = commander en ligne (e-commerce), reserve = réserver, contact = contact / devis." },
    name: str("Nom public de l’établissement s’il est donné, sinon vide."),
    description: str("Description de l’établissement, 1 à 2 phrases (≤ 300 caractères)."),
    announcement: str("Bandeau d’annonce en MAJUSCULES (≤ 100 caractères)."),
    colors: object({
      primary: str("Couleur principale #RRGGBB (boutons, mots mis en avant)."),
      background: str("Couleur de fond #RRGGBB. Clair par défaut ; foncé seulement si demandé."),
      accent: str("Couleur d’accent #RRGGBB (touches décoratives)."),
    }),
    fonts: object({
      heading: { type: "string", enum: [...fontIds], description: "georgia/playfair/fraunces/dmSerif = serif élégant ; poppins/inter/arial/trebuchet = moderne ; nunito = rond et convivial." },
      body: { type: "string", enum: [...fontIds] },
    }),
    hero: object({
      kicker: str("Surtitre en MAJUSCULES (≤ 60 caractères)."),
      title: str("Grand titre (≤ 80 caractères). Retour à la ligne avec \\n. Mettez 2 à 4 mots en valeur *entre astérisques*."),
      lead: str("Accroche (≤ 220 caractères)."),
      primaryLabel: str("Texte du bouton principal (≤ 30 caractères)."),
      secondaryLabel: str("Texte du bouton secondaire (≤ 30 caractères)."),
      badges: strings("Exactement 4 atouts très courts (≤ 30 caractères chacun)."),
    }),
    marquee: strings("4 messages courts en MAJUSCULES pour le bandeau défilant."),
    products: object({
      kicker: str("Surtitre de la section produits."),
      title: str("Titre de la section produits, un mot *en valeur*."),
      aside: str("Phrase d’accompagnement (≤ 120 caractères, \\n autorisé)."),
    }),
    about: object({
      kicker: str("Surtitre de la section histoire."),
      title: str("Titre de la section histoire, un mot *en valeur*."),
      paragraphs: strings("2 paragraphes courts, sincères, sans inventer de faits vérifiables (dates, récompenses, chiffres)."),
    }),
    faq: {
      type: "array",
      description: "4 questions fréquentes d’un site e-commerce adaptées au métier (commande, paiement, retrait/livraison, autre).",
      items: object({ question: str("Question."), answer: str("Réponse en 1 à 2 phrases, sans promesse chiffrée non fournie.") }),
    },
    cta: object({ title: str("Titre de l’appel à l’action final, un mot *en valeur*."), text: str("Phrase courte."), label: str("Texte du bouton.") }),
    footer: object({ tagline: str("Signature de pied de page (≤ 100 caractères)."), cta: str("Petite question d’invitation (≤ 40 caractères).") }),
    seo: object({ title: str("Titre pour Google (≤ 60 caractères)."), description: str("Description pour Google (≤ 160 caractères).") }),
    addonSections: { type: "array", items: { type: "string", enum: [...fluxAddonSections] }, description: "Modules d’add-ons utiles au site (posés seulement s’ils sont installés)." },
    extras: object({
      loader: optionalId("Id d’un écran de chargement DÉJÀ INSTALLÉ (installed=true)."),
      notFound: optionalId("Id d’une page 404 DÉJÀ INSTALLÉE."),
      background: optionalId("Id d’un fond de site DÉJÀ INSTALLÉ."),
      decoration: optionalId("Id d’une décoration DÉJÀ INSTALLÉE."),
    }),
    suggestions: {
      type: "array",
      description: "0 à 3 add-ons du catalogue NON installés qui amélioreraient vraiment ce site, avec la raison en une phrase.",
      items: object({ id: str("Id exact du catalogue."), reason: str("Pourquoi, en une phrase orientée client.") }),
    },
  }),
};

const instructions = `Tu es FLUX, le créateur de sites internet de STUDIO OS (Studio ATS). Tu construis en UNE SEULE fois un site e-commerce complet à partir de la demande de l’utilisateur, écrite ou dictée à l’oral (transcription parfois imparfaite).

Règles :
- Appelle l’outil build_site une seule fois, avec tous les champs. Ne pose pas de question : déduis ce qui manque du métier et du ton, avec des choix sûrs et élégants.
- Le site a déjà les bases e-commerce (catalogue, panier, paiement, suivi de commande, pages légales) : tu choisis le style, les textes et l’action principale.
- Écris en français, chaleureux, concret, sans superlatifs creux ni faits inventés (pas de dates, récompenses, avis ou chiffres non fournis).
- Couleurs : respecte celles demandées ; garde un fond clair sauf demande contraire. Le contraste est corrigé automatiquement.
- Utilise seulement les modèles gratuits proposés et, dans extras, uniquement des add-ons déjà installés.
- Propose dans suggestions des add-ons non installés qui servent vraiment la demande (livraison pour un e-commerce qui livre, réservation pour une table, etc.). N’en propose pas par principe.
- Pars de la proposition de départ fournie et améliore-la : textes plus personnels, couleurs plus justes.`;

export type FluxCatalogEntry = {
  id: string;
  name: string;
  kind: string;
  pricing: "free" | "one_time" | "subscription";
  priceCents: number;
  installed: boolean;
};

export type FluxLlmOutcome = {
  plan: FluxPlan;
  reply: string;
  suggestions: { id: string; reason: string }[];
  usages: TokenUsage[];
  model: string;
  costEur: number;
};

export async function askFluxLlm(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  start: FluxPlan,
  site: { name: string; current: string },
  catalog: FluxCatalogEntry[],
): Promise<FluxLlmOutcome | null> {
  const context = JSON.stringify({
    etablissement: site.name,
    site_actuel: site.current,
    proposition_de_depart: start,
    catalogue_addons: catalog.map((c) => [c.id, c.name, c.kind, c.pricing === "free" ? "gratuit" : `${(c.priceCents / 100).toFixed(2)} €`, c.installed ? "installed" : "non installé"]),
  });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 1500) })),
    { role: "user", content: `<contexte>${context}</contexte>\n\nDemande : ${message}` },
  ];
  while (messages[0] && messages[0].role !== "user") messages.shift();
  const response = await anthropic().beta.messages.create({
    model: llmModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: instructions, cache_control: { type: "ephemeral" } }],
    tools: [buildSiteTool],
    messages,
  });
  const usages = [response.usage];
  const call = response.content.find(
    (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "build_site",
  );
  if (!call) return null;
  const input = call.input as Record<string, unknown>;
  const known = new Set(catalog.map((c) => c.id));
  return {
    plan: normalizePlan(input, start),
    reply: String(input.reply ?? "").trim().slice(0, 600),
    suggestions: (Array.isArray(input.suggestions) ? input.suggestions : [])
      .map((s) => ({ id: String((s as { id?: unknown }).id ?? ""), reason: String((s as { reason?: unknown }).reason ?? "").slice(0, 200) }))
      .filter((s) => known.has(s.id))
      .slice(0, 3),
    usages,
    model: response.model,
    costEur: providerCostEur(response.model, usages),
  };
}
