import type { NavigationContribution } from "@/core/navigation/registry";

export const tableBookingNavigation = {
  id: "reservations",
  name: "Réservations",
  group: "OPÉRATIONS",
  icon: "CalendarDays",
  permission: "reservations",
} satisfies NavigationContribution;
