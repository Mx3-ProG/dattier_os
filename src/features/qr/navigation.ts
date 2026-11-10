import type { NavigationContribution } from "@/core/navigation/registry";

export const qrNavigation = {
  id: "qr",
  name: "QR codes",
  group: "PILOTAGE",
  icon: "QrCode",
  permission: null,
  addon: "qr",
} satisfies NavigationContribution;
