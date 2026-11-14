import { getDb } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { publicDirectory, type DirectoryEntry } from "@/features/seo/directory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Annuaire des commerces Studio OS",
  description: "Découvrez les commerces qui utilisent Studio OS.",
};

export default async function DirectoryPage() {
  const entries: DirectoryEntry[] = await withDatabaseContext({ public: true }, () =>
    getDb().then((db) =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        return publicDirectory(tx);
      }),
    ),
  );
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>Annuaire des commerces</h1>
      <p>Commerces ayant choisi d’apparaître publiquement.</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <a href={`/r/${encodeURIComponent(entry.id)}`}>{entry.name}</a>
            {entry.industry ? ` — ${entry.industry}` : ""}
            {entry.address ? ` · ${entry.address}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
