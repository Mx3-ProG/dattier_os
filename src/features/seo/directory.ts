import { rows, type DB } from "@/infrastructure/database/db";

export type DirectoryEntry = {
  id: string;
  name: string;
  industry: string;
  address: string;
};

/** Liste publique, opt-in, minimale. Aucune donnée client. */
export async function publicDirectory(db: DB): Promise<DirectoryEntry[]> {
  return rows<DirectoryEntry>(
    db,
    "SELECT id,name,industry,address FROM restaurants WHERE directory_opt_in=true AND archived_at IS NULL ORDER BY name LIMIT 500",
  );
}
