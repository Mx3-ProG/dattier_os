import { one, type DB } from "@/infrastructure/database/db";
import type { Industry } from "./catalog";
export async function establishmentIndustry(db:DB,restaurant:string):Promise<Industry> {
  return (await one<{industry:Industry}>(db,"SELECT industry FROM restaurants WHERE id=$1",[restaurant])).industry;
}
export async function requireRestaurantIndustry(db:DB,restaurant:string) {
  if (await establishmentIndustry(db,restaurant)!=="restaurant")
    throw new Error("Cette opération est réservée aux établissements de restauration.");
}
