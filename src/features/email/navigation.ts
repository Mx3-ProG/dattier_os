import type { NavigationContribution } from "@/core/navigation/registry";

/** Entrée « Emails » du poste de travail (module `email-automation`). */
export const emailsNavigation = {
  id: "emails",
  name: "Emails",
  group: "RELATION CLIENT",
  icon: "Mail",
  permission: "customers",
  addon: "email-automation",
} satisfies NavigationContribution;
