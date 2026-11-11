import type { ClaimedMessage, DeliveryContext, RenderPort } from "../engine/port";
import { readBrand } from "./brand";
import { renderEmail } from "./render";
import { customVariables, defaultCustomContent, readContent, triggerFor, type TemplateContent } from "./templates";

/** Mention d'opposition des emails marketing (même texte que les messages clients). */
export const UNSUBSCRIBE_NOTICE = "Vous ne souhaitez plus recevoir nos offres ? Répondez simplement à ce message.";

/** Modèle effectif d'une clé : celui de l'établissement, sinon le modèle par défaut. */
export function resolveTemplate(
  key: string,
  templates: DeliveryContext["templates"],
): { content: TemplateContent; category: "transactional" | "marketing" } | null {
  const trigger = triggerFor(key);
  const stored = templates[key];
  if (trigger)
    return { content: readContent(stored?.content, trigger.defaults), category: trigger.category };
  if (stored) return { content: readContent(stored.content, defaultCustomContent), category: stored.category };
  return null;
}

/** Port de rendu branché dans le moteur d'envoi. */
export const renderMessage: RenderPort = (message: ClaimedMessage, context: DeliveryContext) => {
  const template = resolveTemplate(message.template_key, context.templates);
  if (!template) throw new Error("Modèle d'email introuvable ou archivé.");
  const brand = readBrand(context.brand);
  const restaurant = context.restaurant?.name ?? "";
  const { _content, ...rest } = message.vars as Record<string, unknown> & { _content?: unknown };
  const content = _content ? readContent(_content, template.content) : template.content;
  const vars = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, String(value ?? "")]));
  const marketing = template.category === "marketing";
  const rendered = renderEmail(brand, content, vars, {
    restaurant,
    unsubscribe: marketing ? UNSUBSCRIBE_NOTICE : undefined,
  });
  const customSender = context.transport?.mode === "custom" ? context.transport.from_name : null;
  return {
    ...rendered,
    fromName: customSender || brand.senderName || restaurant,
    replyTo: brand.replyTo || undefined,
    marketing,
  };
};

export const variablesFor = (key: string) => triggerFor(key)?.variables ?? customVariables;
