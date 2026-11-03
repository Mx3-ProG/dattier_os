import { ZodError } from "zod";
import { level, type ModuleId, type SeverityName } from "./model";

/** Deterministic classification: same input, same severity. No AI involved. */
export type Classified = {
  severity: number;
  event_type: string;
  module: ModuleId;
  message: string;
  error_code?: string;
};
const c = (
  severity: SeverityName,
  module: ModuleId,
  event_type: string,
  message: string,
  error_code?: string,
): Classified => ({
  severity: level(severity),
  module,
  event_type,
  message,
  error_code,
});

/** Business action keys of /api/v1/action and /api/shop/* → module. */
const actionModules: Record<string, ModuleId> = {
  order: "orders",
  confirmOrder: "orders",
  table: "orders",
  checkout: "orders",
  item: "kitchen",
  transition: "kitchen",
  pay: "payments",
  settle: "payments",
  payment: "payments",
  webhook: "payments",
  stock: "stock",
  lot: "stock",
  ingredient: "stock",
  ingredientLifecycle: "stock",
  supplier: "purchases",
  purchase: "purchases",
  receive: "purchases",
  reservation: "reservations",
  shift: "team",
  deleteShift: "team",
  clock: "team",
  expense: "payments",
  customer: "customers",
  loyalty: "customers",
  issuePromo: "customers",
  cancelPromo: "customers",
  loyaltyReward: "customers",
  archiveReward: "customers",
  reviewModeration: "customers",
  review: "customers",
  menu: "catalog",
  recipe: "catalog",
  recipeRemove: "catalog",
  createProduct: "catalog",
  productLifecycle: "catalog",
  product: "catalog",
  upload: "catalog",
  read: "notifications",
  restaurant: "settings",
  addRestaurant: "settings",
  settings: "settings",
  reset: "settings",
  login: "auth",
  security: "security",
};
export const moduleFor = (action?: string): ModuleId =>
  (action && actionModules[action]) ||
  (action?.startsWith("customer-") ? "auth" : "system");

/** Actions whose success is a sensitive change (NOTICE). */
const sensitiveActions = new Set([
  "restaurant",
  "addRestaurant",
  "settings",
  "reset",
  "issuePromo",
  "cancelPromo",
  "loyaltyReward",
  "expense",
]);

/** Maps an existing audit_logs line (free text) to a structured event. */
export function classifyAudit(action: string): Classified {
  const generic = /^Action : (\w+)/.exec(action);
  if (generic) {
    const key = generic[1];
    return c(
      sensitiveActions.has(key) ? "NOTICE" : "INFO",
      moduleFor(key),
      `action.${key}`,
      action,
    );
  }
  const rules: [RegExp, SeverityName, ModuleId, string][] = [
    [
      /^Site : (version|réglages|média supprimé)/,
      "NOTICE",
      "settings",
      "website.published",
    ],
    [/^Site :/, "INFO", "settings", "website.changed"],
    [
      /Paramètres boutique|Personnalisations produit/i,
      "NOTICE",
      "settings",
      "settings.changed",
    ],
    [
      /Règlement déclaré|Encaissement|paiement|Stripe/i,
      "INFO",
      "payments",
      "payment.recorded",
    ],
    [/Préparation :/i, "INFO", "kitchen", "kitchen.transition"],
    [/Commande|commande/, "INFO", "orders", "order.recorded"],
    [/réservation/i, "INFO", "reservations", "reservation.recorded"],
    [
      /Matière première|lot|stock|Ingrédient/i,
      "INFO",
      "stock",
      "stock.changed",
    ],
    [
      /Code|promo|fidélité|Récompense/i,
      "NOTICE",
      "customers",
      "loyalty.changed",
    ],
    [/Avis/i, "INFO", "customers", "review.moderated"],
    [/Produit|carte|recette/i, "INFO", "catalog", "catalog.changed"],
  ];
  for (const [pattern, severity, module, type] of rules)
    if (pattern.test(action)) return c(severity, module, type, action);
  return c("INFO", "system", "audit.recorded", action);
}

/** Known, explicitly thrown failures with a confirmed meaning. */
const knownFailures: [RegExp, () => Classified][] = [
  [
    /Stripe ne répond pas/,
    () =>
      c(
        "ERROR",
        "payments",
        "payment.provider.unreachable",
        "Le service de paiement en ligne n’a pas répondu. La commande reste enregistrée, non payée ; le client peut réessayer depuis son suivi.",
        "STRIPE_UNREACHABLE",
      ),
  ],
  [
    /Session de test Stripe invalide/,
    () =>
      c(
        "ERROR",
        "payments",
        "payment.provider.invalid_response",
        "Le service de paiement a renvoyé une réponse inattendue. Aucun paiement n’a été enregistré.",
        "STRIPE_INVALID_SESSION",
      ),
  ],
  [
    /Stripe test non configuré/,
    () =>
      c(
        "INFO",
        "payments",
        "payment.provider.not_configured",
        "Le paiement en ligne n’est pas configuré sur cette installation.",
        "STRIPE_NOT_CONFIGURED",
      ),
  ],
  [
    /Signature Stripe (invalide|expirée)/,
    () =>
      c(
        "WARNING",
        "payments",
        "webhook.signature.rejected",
        "Une notification de paiement non authentifiée a été refusée. Aucune commande n’a été modifiée.",
        "WEBHOOK_SIGNATURE",
      ),
  ],
  [
    /Webhook non configuré/,
    () =>
      c(
        "WARNING",
        "payments",
        "webhook.not_configured",
        "Une notification de paiement est arrivée alors que le webhook n’est pas configuré.",
        "WEBHOOK_NOT_CONFIGURED",
      ),
  ],
  [
    /Mode local désactivé|stockage doit être explicitement/,
    () =>
      c(
        "CRITICAL",
        "system",
        "system.database.unavailable",
        "La base de données de l’application est indisponible.",
        "DB_UNAVAILABLE",
      ),
  ],
  [
    /Origine non autorisée/,
    () =>
      c(
        "WARNING",
        "security",
        "request.origin.rejected",
        "Une requête venant d’une origine non autorisée a été bloquée.",
        "ORIGIN_REJECTED",
      ),
  ],
  [
    /Requête trop volumineuse/,
    () =>
      c(
        "WARNING",
        "security",
        "request.too_large",
        "Une requête anormalement volumineuse a été refusée.",
        "BODY_TOO_LARGE",
      ),
  ],
];

export type FailureContext = {
  endpoint?: string;
  action?: string;
  status: number;
};

/** Classifies an error returned to a client by a route handler. */
export function classifyFailure(
  error: unknown,
  ctx: FailureContext,
): Classified {
  const message = error instanceof Error ? error.message : String(error);
  const area = moduleFor(ctx.action || ctx.endpoint);
  for (const [pattern, make] of knownFailures)
    if (pattern.test(message)) return make();
  const auth =
    ctx.endpoint === "login" ||
    ["customer-login", "customer-reset", "customer-register"].includes(
      ctx.endpoint ?? "",
    );
  if (auth)
    return c(
      "INFO",
      "auth",
      "auth.login.failure",
      ctx.endpoint === "login"
        ? "Échec de connexion à l’espace équipe."
        : "Échec de connexion à un compte client.",
      "AUTH_FAILED",
    );
  if (ctx.status === 401)
    return c(
      "DEBUG",
      "auth",
      "auth.required",
      "Une requête sans session valide a été refusée.",
      "AUTH_REQUIRED",
    );
  if (ctx.status === 403)
    return c(
      "WARNING",
      "security",
      "access.denied",
      "Un accès non autorisé pour ce profil a été refusé.",
      "ACCESS_DENIED",
    );
  if (error instanceof ZodError || error instanceof SyntaxError)
    return c(
      "DEBUG",
      area,
      "request.invalid",
      "Des données invalides ont été refusées avant traitement.",
      "VALIDATION",
    );
  const sqlState = (error as { code?: unknown })?.code;
  if (typeof sqlState === "string" && /^[0-9A-Z]{5}$/.test(sqlState))
    return sqlState.startsWith("23")
      ? c(
          "WARNING",
          area,
          "database.constraint",
          "La base de données a refusé une opération incohérente ; rien n’a été enregistré.",
          `SQL_${sqlState}`,
        )
      : c(
          "ERROR",
          area,
          "database.error",
          "Une opération a échoué à cause d’une erreur de base de données ; rien n’a été enregistré.",
          `SQL_${sqlState}`,
        );
  if (/query:|constraint|SELECT|INSERT|UPDATE/.test(message))
    return c(
      "ERROR",
      area,
      "database.error",
      "Une opération a échoué à cause d’une erreur de base de données ; rien n’a été enregistré.",
      "SQL_ERROR",
    );
  if (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof RangeError ||
    !(error instanceof Error)
  )
    return c(
      "ERROR",
      area,
      "application.error",
      "Une erreur technique inattendue a interrompu une opération.",
      "APP_ERROR",
    );
  // Plain Error with a French message: a business rule refused the request.
  return c(
    "INFO",
    area,
    "operation.refused",
    `Opération refusée : ${message}`,
    "BUSINESS_RULE",
  );
}
