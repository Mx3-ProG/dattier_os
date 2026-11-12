import { type DB } from "../../infrastructure/database/db";
import type { Actor } from "../../infrastructure/auth/session";
import {
  issuePromo,
  cancelPromo,
} from "@/features/loyalty/service";
import {
  createFlashPromotion,
  saveEngagementSettings,
  stopFlashPromotion,
} from "@/features/commerce/engagement";
import { messageCustomer } from "@/features/messaging/service";
import { log } from "@/features/orders/service";
import { actionSchema } from "./schema";

type Action = import("zod").infer<typeof actionSchema>;

export async function performCommerceAction(
  db: DB,
  r: string,
  user: Actor,
  a: Action,
) {
  switch (a.action) {
    case "issuePromo":
      return issuePromo(db, r, user, a);
    case "engagementSettings":
      return saveEngagementSettings(db, r, user, a);
    case "flashPromotion":
      return createFlashPromotion(db, r, user, a);
    case "stopFlashPromotion":
      return stopFlashPromotion(db, r, user, a.id);
    case "cancelPromo":
      return cancelPromo(db, r, user, a.id);
    case "messageCustomer": {
      const sent = await messageCustomer(db, r, user, a);
      await log(db, r, user.id, `Message ${a.channel} au client`, a.id);
      return sent;
    }
  }
}
