import { requirePlan, requirePaidAddon } from "@/features/platform/entitlements";
import { z } from "zod";
import { actionSchema } from "./actions/schema";
import { performOrderAction } from "./actions/orders";
import { performFloorAction } from "./actions/floor";
import { performProcurementAction } from "./actions/procurement";
import { performHrAction } from "./actions/hr";
import { performCommerceAction } from "./actions/commerce";
import { performExpenseAction } from "./actions/expense";
import { performCustomerAction } from "./actions/customers";
import { performCatalogAction } from "./actions/catalog";
import { performSettingsAction } from "./actions/settings";
import { type DB } from "../infrastructure/database/db";
import type { Actor } from "../infrastructure/auth/session";

import { log } from "@/features/orders/service";
export async function perform(
  db: DB,
  r: string,
  user: Actor,
  a: z.infer<typeof actionSchema>,
) {
  if (["issuePromo","cancelPromo","customer","loyalty","engagementSettings",
       "flashPromotion","stopFlashPromotion"].includes(a.action) ||
      (a.action === "pay" && (a.customer || a.promo)))
    await requirePaidAddon(db,r,"loyalty");
  if (["expense","messageCustomer"].includes(a.action))
    await requirePlan(db, r, 39);
  switch (a.action) {
    case "createProduct":
    case "productLifecycle": {
      const result = await performCatalogAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "issuePromo":
    case "engagementSettings":
    case "flashPromotion":
    case "stopFlashPromotion":
    case "cancelPromo":
    case "messageCustomer": {
      const result = await performCommerceAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "order":
    case "item":
    case "pay":
    case "confirmOrder": {
      const result = await performOrderAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "saveTable":
    case "moveTable":
    case "rotateTable":
    case "tableLifecycle":
    case "saveZone":
    case "moveZone":
    case "deleteZone":
    case "table":
    case "reservation": {
      const result = await performFloorAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "stock":
    case "supplier":
    case "supplierIngredient":
    case "ingredient":
    case "purchase":
    case "receive": {
      const result = await performProcurementAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "shift":
    case "deleteShift":
    case "clock": {
      const result = await performHrAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "expense": {
      const result = await performExpenseAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "customer":
    case "loyalty": {
      const result = await performCustomerAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "menu": {
      const result = await performCatalogAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "recipe": {
      const result = await performCatalogAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
    case "read":
    case "restaurant":
    case "addRestaurant": {
      const result = await performSettingsAction(db, r, user, a);
      if (result !== undefined) return result;
      break;
    }
  }
  await log(db, r, user.id, `Action : ${a.action}`, "id" in a ? a.id : null);
}
export {
  reservationSchema,
  requestReservation,
} from "@/features/reservations/service";

export { actionSchema } from "./actions/schema";
