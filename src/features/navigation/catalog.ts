import { createNavigation } from "@/core/navigation/registry";
import { addonsNavigation } from "@/features/addons/navigation";
import { overviewNavigation } from "@/features/pilotage/navigation";
import {
  activityNavigation,
  securityNavigation,
} from "@/features/ops-security/navigation";
import { qrNavigation } from "@/features/qr/navigation";
import { analyticsNavigation } from "@/features/analytics/navigation";
import { estimationNavigation } from "@/features/estimation/navigation";
import { floorNavigation } from "@/features/floor/navigation";
import {
  ordersNavigation,
  kitchenNavigation,
  barNavigation,
} from "@/features/orders/navigation";
import { tableBookingNavigation } from "@/features/reservations/navigation";
import {
  stocksNavigation,
  recipesNavigation,
} from "@/features/inventory/navigation";
import {
  suppliersNavigation,
  deliveriesNavigation,
} from "@/features/procurement/navigation";
import {
  teamNavigation,
  attendanceNavigation,
  hrNavigation,
  payrollNavigation,
} from "@/features/hr/navigation";
import {
  financeNavigation,
  accountingNavigation,
  expensesNavigation,
} from "@/features/finance/navigation";
import { billingNavigation } from "@/features/billing/navigation";
import { invoicesNavigation } from "@/features/invoices/navigation";
import { bankNavigation } from "@/features/bank/navigation";
import { payoutsNavigation } from "@/features/payments/navigation";
import { customersNavigation } from "@/features/loyalty/navigation";
import { menuNavigation } from "@/features/catalog/navigation";
import { settingsNavigation } from "@/features/platform/navigation";
import { siteNavigation } from "@/features/cms/navigation";

/** Restaurant composition: preserve historic order; features own their contributions. */
export const workspaceNavigation = createNavigation([
  overviewNavigation,
  activityNavigation,
  qrNavigation,
  analyticsNavigation,
  estimationNavigation,
  floorNavigation,
  ordersNavigation,
  kitchenNavigation,
  barNavigation,
  tableBookingNavigation,
  stocksNavigation,
  recipesNavigation,
  suppliersNavigation,
  deliveriesNavigation,
  teamNavigation,
  attendanceNavigation,
  hrNavigation,
  financeNavigation,
  accountingNavigation,
  billingNavigation,
  invoicesNavigation,
  bankNavigation,
  payrollNavigation,
  payoutsNavigation,
  expensesNavigation,
  customersNavigation,
  menuNavigation,
  settingsNavigation,
  siteNavigation,
  securityNavigation,
  addonsNavigation,
]);
