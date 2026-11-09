import type { NavigationContribution } from "@/core/navigation/registry";

export const ordersNavigation = {
  id: "orders",
  name: "Commandes",
  group: "OPÉRATIONS",
  icon: "ClipboardList",
  permission: "orders",
} satisfies NavigationContribution;

export const kitchenNavigation = {
  id: "kitchen",
  name: "Cuisine",
  group: "OPÉRATIONS",
  icon: "ChefHat",
  permission: "kitchen",
} satisfies NavigationContribution;

export const barNavigation = {
  id: "bar",
  name: "Bar",
  group: "OPÉRATIONS",
  icon: "Wine",
  permission: "bar",
} satisfies NavigationContribution;
