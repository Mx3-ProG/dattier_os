import type { NavigationContribution } from "@/core/navigation/registry";

export const teamNavigation = {
  id: "team",
  name: "Équipe & planning",
  group: "ÉQUIPE",
  icon: "Users",
  permission: "team",
} satisfies NavigationContribution;

export const attendanceNavigation = {
  id: "attendance",
  name: "Présences",
  group: "ÉQUIPE",
  icon: "Clock",
  permission: null,
  addon: "attendance",
} satisfies NavigationContribution;

export const hrNavigation = {
  id: "hr",
  name: "Heures & absences",
  group: "ÉQUIPE",
  icon: "CalendarOff",
  permission: "team",
  addon: "attendance",
} satisfies NavigationContribution;

export const payrollNavigation = {
  id: "payroll",
  name: "Paie",
  group: "PILOTAGE FINANCIER",
  icon: "HandCoins",
  permission: "payroll",
  addon: "payroll",
} satisfies NavigationContribution;
