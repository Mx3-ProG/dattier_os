import type { NavigationContribution } from "@/core/navigation/registry";

export const overviewNavigation = {
  id: "overview",
  name: "Vue d’ensemble",
  group: "PILOTAGE",
  icon: "LayoutDashboard",
  permission: "finance",
  commercialCapability: "finance",
} satisfies NavigationContribution;

export const prospectScannerNavigation = {
  id: "prospect-scanner", name: "Scanner de prospects", group: "PILOTAGE", icon: "Activity", permission: "analytics", addon: "prospect-scanner",
} satisfies NavigationContribution;
export const pipelineCrmNavigation = {
  id: "pipeline-crm", name: "Pipeline CRM", group: "PILOTAGE", icon: "ClipboardList", permission: "analytics", addon: "pipeline-crm",
} satisfies NavigationContribution;
export const customerHealthNavigation = {
  id: "customer-health", name: "Customer Health", group: "PILOTAGE", icon: "Heart", permission: "customers", addon: "customer-health",
} satisfies NavigationContribution;
