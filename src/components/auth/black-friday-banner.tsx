import { BlackFridayBar } from "@/components/black-friday-bar";
import { activePromotion } from "@/features/platform/promotion";

export function BlackFridayBanner() {
  const promo = activePromotion();
  return promo ? <BlackFridayBar promo={promo} /> : null;
}
