import { notFound } from "next/navigation";
import { getDb } from "@/infrastructure/database/db";
import { withDatabaseContext } from "@/infrastructure/database/context";
import { publicDirectory, type DirectoryEntry } from "@/features/seo/directory";
import { industries, isIndustry } from "@/core/tenant/business";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ industry: string }> };

export async function generateMetadata({ params }: Props) {
  const { industry } = await params;
  if (!isIndustry(industry)) return { title: "Annuaire" };
  const entries = await load(industry);
  return {
    title: `Annuaire ${industry} — Studio OS`,
    description: `Commerces du secteur ${industry} utilisant Studio OS.`,
    robots: { index: entries.length >= 3, follow: true },
  };
}

async function load(industry: string): Promise<DirectoryEntry[]> {
  const all = await withDatabaseContext({ public: true }, () =>
    getDb().then((db) =>
      db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE atacuisine_app");
        return publicDirectory(tx);
      }),
    ),
  );
  return all.filter((e) => e.industry === industry);
}

export default async function IndustryDirectoryPage({ params }: Props) {
  const { industry } = await params;
  if (!isIndustry(industry)) notFound();
  const entries = await load(industry);
  if (entries.length === 0) notFound();
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>Annuaire — {industry}</h1>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <a href={`/r/${encodeURIComponent(entry.id)}`}>{entry.name}</a>
            {entry.address ? ` · ${entry.address}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
