import type { Industry } from "@/core/tenant/business";

/**
 * Manifeste unique des modules (lot P1-a1, docs/platform/CORE-ET-MODULES.md § 9).
 *
 * Deux informations par module, volontairement séparées :
 * - `offer` et `requires` décrivent l'offre CIBLE décidée le 10 novembre 2026 ;
 * - `legacy` décrit la règle d'accès commerciale APPLIQUÉE AUJOURD'HUI, telle que la
 *   navigation (`workspaceNavigation.resolve`) et le snapshot la calculent.
 *
 * `app.module_available` (migration 090) implémente `legacy` en SQL. Tant que la bascule
 * (P1-a2) n'est pas faite, la cible n'ouvre ni ne ferme aucun accès. Les permissions de
 * rôle restent vérifiées à part par les services.
 */
export type ModuleOffer =
  /** Compris dans l'abonnement Studio, toujours présent. */
  | "included"
  /** Compris dans Studio, mais désactivable par le commerce (site internet). */
  | "included-optional"
  /** Add-on payant à l'abonnement mensuel. */
  | "addon-monthly"
  /** Payé à l'usage avec les crédits IA. */
  | "ai-credits";

/** Règle commerciale actuelle, reproduite à l'identique par `app.module_available`. */
export type LegacyRule =
  /** Aucune condition commerciale. */
  | { kind: "always" }
  /** Abonnement Studio actif (`app.restaurant_plan >= 39`). */
  | { kind: "plan" }
  /** `app.addon_installed(business, addon)` : droit commercial et installation. */
  | { kind: "addon"; addon: string }
  /** `app.module_enabled(business, module)` : installation, suspension, dépendance. */
  | { kind: "module"; module: "floor" | "table-booking" }
  /** Licence boutique installée pour ce produit. */
  | { kind: "license"; product: string }
  /** Au moins une licence boutique installée de ce type de produit. */
  | { kind: "license-kind"; productKind: "business" };

export type ModuleFamily =
  | "pilotage"
  | "operations"
  | "gestion"
  | "equipe"
  | "finance"
  | "relation-client"
  | "site"
  | "configuration"
  | "exploitation"
  | "ia";

export type ModuleManifest = {
  id: string;
  label: string;
  family: ModuleFamily;
  offer: ModuleOffer;
  /** Dépendances cibles obligatoires. */
  requires: readonly string[];
  /** Dépendances cibles facultatives : elles enrichissent le module sans le conditionner. */
  enhancedBy: readonly string[];
  /** Entrées de navigation du poste de travail portées par ce module. */
  navigation: readonly string[];
  /** Secteurs visés par l'offre cible. Vide : tous les secteurs. */
  industries: readonly Industry[];
  legacy: LegacyRule & {
    /** Aujourd'hui réservé aux commerces du secteur restauration. */
    restaurantOnly?: true;
  };
  /** Point de l'offre cible encore à confirmer. */
  pending?: string;
};

const always = { kind: "always" } as const;
const plan = { kind: "plan" } as const;
const food = { restaurantOnly: true } as const;
const addon = (id: string) => ({ kind: "addon", addon: id }) as const;

export const moduleManifest = [
  // --- Compris dans Studio --------------------------------------------------------
  { id: "overview", label: "Vue d'ensemble", family: "pilotage", offer: "included", requires: [], enhancedBy: [], navigation: ["overview"], industries: [], legacy: plan },
  { id: "activity", label: "Activité", family: "pilotage", offer: "included", requires: [], enhancedBy: [], navigation: ["activity"], industries: [], legacy: always },
  { id: "orders", label: "Commandes", family: "operations", offer: "included", requires: ["catalog"], enhancedBy: ["floor", "kitchen", "bar"], navigation: ["orders"], industries: [], legacy: { ...always, ...food } },
  { id: "table-booking", label: "Réservations", family: "operations", offer: "included", requires: [], enhancedBy: ["floor"], navigation: ["reservations"], industries: [], legacy: { kind: "module", module: "table-booking" } },
  { id: "catalog", label: "Carte et catalogue", family: "configuration", offer: "included", requires: [], enhancedBy: [], navigation: ["menu"], industries: [], legacy: { ...always, ...food } },
  { id: "stock", label: "Stock simple", family: "gestion", offer: "included", requires: ["catalog"], enhancedBy: ["recipes", "deliveries"], navigation: ["stocks"], industries: [], legacy: { ...always, ...food } },
  { id: "services", label: "Services", family: "gestion", offer: "included", requires: [], enhancedBy: ["website"], navigation: ["services"], industries: [], legacy: always },
  { id: "products", label: "Produits", family: "gestion", offer: "included", requires: [], enhancedBy: ["website", "stock"], navigation: ["products"], industries: [], legacy: always },
  { id: "trade-tools", label: "Outils métier", family: "gestion", offer: "included", requires: [], enhancedBy: [], navigation: ["trade-tools"], industries: [], legacy: { kind: "license-kind", productKind: "business" } },
  { id: "team", label: "Équipe", family: "equipe", offer: "included", requires: [], enhancedBy: [], navigation: ["team"], industries: [], legacy: always },
  { id: "finance", label: "Finance et rapports", family: "finance", offer: "included", requires: [], enhancedBy: [], navigation: ["finance"], industries: [], legacy: plan },
  { id: "bank", label: "Banque", family: "finance", offer: "included", requires: [], enhancedBy: [], navigation: ["bank"], industries: [], legacy: plan },
  { id: "payouts", label: "Versements", family: "finance", offer: "included", requires: [], enhancedBy: [], navigation: ["payouts"], industries: [], legacy: plan },
  { id: "settings", label: "Configuration", family: "configuration", offer: "included", requires: [], enhancedBy: [], navigation: ["settings", "addons"], industries: [], legacy: always },
  { id: "security", label: "Sécurité opérationnelle", family: "configuration", offer: "included", requires: [], enhancedBy: [], navigation: ["security"], industries: [], legacy: always },
  { id: "website", label: "Site internet", family: "site", offer: "included-optional", requires: [], enhancedBy: [], navigation: ["site"], industries: [], legacy: addon("website") },

  // --- Add-ons mensuels -----------------------------------------------------------
  { id: "online-orders", label: "Boutique en ligne", family: "site", offer: "addon-monthly", requires: ["website", "catalog"], enhancedBy: ["stock"], navigation: [], industries: [], legacy: addon("online-orders") },
  { id: "click-collect-premium", label: "Click & Collect Premium", family: "site", offer: "addon-monthly", requires: ["online-orders"], enhancedBy: [], navigation: [], industries: [], legacy: addon("click-collect-premium") },
  { id: "domain", label: "Domaine personnalisé", family: "site", offer: "addon-monthly", requires: ["website"], enhancedBy: [], navigation: [], industries: [], legacy: addon("domain") },
  { id: "floor", label: "Plan de salle", family: "operations", offer: "addon-monthly", requires: [], enhancedBy: [], navigation: ["dining"], industries: ["restaurant"], legacy: { kind: "module", module: "floor" } },
  { id: "kitchen", label: "Cuisine", family: "operations", offer: "addon-monthly", requires: ["orders"], enhancedBy: [], navigation: ["kitchen"], industries: ["restaurant"], legacy: { ...always, ...food } },
  { id: "bar", label: "Bar", family: "operations", offer: "addon-monthly", requires: ["orders"], enhancedBy: [], navigation: ["bar"], industries: ["restaurant"], legacy: { ...always, ...food } },
  { id: "recipes", label: "Recettes", family: "gestion", offer: "addon-monthly", requires: ["catalog"], enhancedBy: ["deliveries"], navigation: ["recipes"], industries: [], legacy: { ...always, ...food } },
  { id: "suppliers", label: "Fournisseurs", family: "gestion", offer: "addon-monthly", requires: [], enhancedBy: [], navigation: ["suppliers"], industries: [], legacy: { ...always, ...food } },
  { id: "deliveries", label: "Réceptions et lots", family: "gestion", offer: "addon-monthly", requires: ["suppliers"], enhancedBy: [], navigation: ["deliveries"], industries: [], legacy: { ...always, ...food } },
  { id: "attendance", label: "Présences et pointage", family: "equipe", offer: "addon-monthly", requires: ["team"], enhancedBy: [], navigation: ["attendance", "hr"], industries: [], legacy: addon("attendance") },
  { id: "payroll", label: "Paie", family: "equipe", offer: "addon-monthly", requires: ["team"], enhancedBy: ["attendance"], navigation: ["payroll"], industries: [], legacy: addon("payroll") },
  { id: "accounting", label: "Comptabilité", family: "finance", offer: "addon-monthly", requires: ["finance"], enhancedBy: [], navigation: ["accounting"], industries: [], legacy: plan, pending: "Non cité dans le périmètre Studio : add-on par défaut, à confirmer." },
  { id: "expenses", label: "Dépenses", family: "finance", offer: "addon-monthly", requires: ["finance"], enhancedBy: [], navigation: ["expenses"], industries: [], legacy: plan },
  { id: "client-invoices", label: "Factures clients", family: "finance", offer: "addon-monthly", requires: ["finance"], enhancedBy: [], navigation: ["billing"], industries: [], legacy: addon("client-invoices") },
  { id: "invoices", label: "Factures fournisseurs", family: "finance", offer: "addon-monthly", requires: ["finance"], enhancedBy: ["suppliers"], navigation: ["invoices"], industries: [], legacy: addon("invoices") },
  { id: "loyalty", label: "Clients et fidélité", family: "relation-client", offer: "addon-monthly", requires: [], enhancedBy: ["website"], navigation: ["customers"], industries: [], legacy: addon("loyalty") },
  { id: "qr", label: "QR codes", family: "relation-client", offer: "addon-monthly", requires: [], enhancedBy: ["orders"], navigation: ["qr"], industries: [], legacy: { ...addon("qr"), ...food } },
  { id: "analytics", label: "Audience", family: "pilotage", offer: "addon-monthly", requires: [], enhancedBy: ["website"], navigation: ["audience"], industries: [], legacy: { kind: "license", product: "earth-tracker-3d" } },
  { id: "estimation", label: "Estimation", family: "pilotage", offer: "addon-monthly", requires: [], enhancedBy: ["website"], navigation: ["estimation"], industries: [], legacy: { kind: "license", product: "estimation-studio" } },
  { id: "prospect-scanner", label: "Scanner de prospects", family: "pilotage", offer: "addon-monthly", requires: [], enhancedBy: ["pipeline-crm"], navigation: ["prospect-scanner"], industries: [], legacy: addon("prospect-scanner") },
  { id: "pipeline-crm", label: "Pipeline CRM", family: "pilotage", offer: "addon-monthly", requires: [], enhancedBy: ["prospect-scanner"], navigation: ["pipeline-crm"], industries: [], legacy: addon("pipeline-crm") },
  { id: "customer-health", label: "Customer Health", family: "pilotage", offer: "addon-monthly", requires: [], enhancedBy: ["pipeline-crm"], navigation: ["customer-health"], industries: [], legacy: addon("customer-health") },
  { id: "offline-conflicts", label: "Conflits hors ligne", family: "exploitation", offer: "addon-monthly", requires: [], enhancedBy: [], navigation: [], industries: [], legacy: addon("offline-conflicts") },
  { id: "connections", label: "Connexions", family: "exploitation", offer: "addon-monthly", requires: [], enhancedBy: [], navigation: [], industries: [], legacy: addon("connections") },

  // --- IA, payée avec les crédits IA ----------------------------------------------
  { id: "ai-assistant", label: "Assistant IA", family: "ia", offer: "ai-credits", requires: [], enhancedBy: [], navigation: [], industries: [], legacy: always },
  { id: "ai-invoice-extraction", label: "Lecture IA des factures", family: "ia", offer: "ai-credits", requires: ["invoices"], enhancedBy: [], navigation: [], industries: [], legacy: addon("invoices") },
] as const satisfies readonly ModuleManifest[];

export type ModuleId = (typeof moduleManifest)[number]["id"];

/** Valide le manifeste : identifiants, dépendances connues, absence de cycle, navigation unique. */
export function validateManifest(entries: readonly ModuleManifest[]) {
  const byId = new Map<string, ModuleManifest>();
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id) || byId.has(entry.id))
      throw new Error(`Invalid or duplicate module: ${entry.id}`);
    byId.set(entry.id, entry);
  }
  const navigation = new Set<string>();
  for (const entry of entries) {
    for (const dependency of [...entry.requires, ...entry.enhancedBy])
      if (dependency === entry.id || !byId.has(dependency))
        throw new Error(`Invalid dependency: ${entry.id} -> ${dependency}`);
    for (const id of entry.navigation) {
      if (navigation.has(id)) throw new Error(`Navigation owned twice: ${id}`);
      navigation.add(id);
    }
    // Un module compris dans Studio ne peut exiger un add-on payant.
    if (entry.offer === "included")
      for (const dependency of entry.requires)
        if (byId.get(dependency)!.offer !== "included")
          throw new Error(`Included module requires a paid one: ${entry.id} -> ${dependency}`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Circular dependency: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.requires) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return byId;
}

const manifestById = validateManifest(moduleManifest);

export const moduleIds = moduleManifest.map((entry) => entry.id) as readonly ModuleId[];
export const isModuleId = (value: string): value is ModuleId => manifestById.has(value);
export const manifestFor = (id: ModuleId) => manifestById.get(id)!;
/** Module qui porte une entrée de navigation du poste de travail. */
export const moduleForNavigation = (navigationId: string) =>
  moduleManifest.find((entry) => (entry.navigation as readonly string[]).includes(navigationId));

/**
 * Modules qu'un abonné payant actuel conserve sans surcoût quand l'offre cible s'applique
 * (table `module_legacy_grants`, migration 091). Décision du 10 novembre 2026 : le site
 * et la boutique seulement. Les autres modules qui deviennent payants ne sont pas conservés.
 */
export const grandfatheredModules = [
  "website",
  "online-orders",
] as const satisfies readonly ModuleId[];
