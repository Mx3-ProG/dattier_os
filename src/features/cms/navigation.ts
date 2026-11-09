import type { NavigationContribution } from "@/core/navigation/registry";

export const siteNavigation = {
  id: "site",
  name: "Mon site web",
  group: "CONFIGURATION",
  icon: "Globe",
  permission: "website",
  commercialCapability: "website",
} satisfies NavigationContribution;
