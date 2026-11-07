/* Base de connaissances de Cuisine IA : le guide d’utilisation (même source que
   la page /guide et la visite interactive). */
import { chapters, glossary } from "@/features/guide/content";
import { normalize, similarity, words } from "./text";
import type { Answer } from "./types";

type Passage = {
  chapter: string;
  chapterTitle: string;
  title: string;
  body: string;
  steps: string[];
};

const passages: Passage[] = chapters.flatMap((c) => [
  {
    chapter: c.id,
    chapterTitle: c.title,
    title: c.title,
    body: `${c.summary} ${c.guide.lead}`,
    steps: [],
  },
  ...c.guide.sections.map((s) => ({
    chapter: c.id,
    chapterTitle: c.title,
    title: s.title,
    body: s.text ?? "",
    steps: [...(s.steps ?? []), ...(s.points ?? [])],
  })),
]);

/** Répond à une question d’usage à partir du guide, ou null si rien ne colle. */
export function searchGuide(question: string): Answer | null {
  const query = words(question).filter((w) => w.length > 2);
  if (!query.length) return null;
  const definition = glossary
    .map((g) => ({ g, score: similarity(query, g.term) }))
    .sort((a, b) => b.score - a.score)[0];
  const howTo = /\b(comment|ou|quand|etapes?)\b/.test(normalize(question));
  if (definition && definition.score >= 0.75 && !howTo)
    return {
      reply: `**${definition.g.term}** : ${definition.g.definition}`,
      proposals: [],
      suggestions: ["Que sais-tu faire ?"],
      links: [{ label: "Glossaire complet", href: "/guide#glossaire" }],
    };
  const ranked = passages
    .map((p) => ({
      p,
      score:
        similarity(query, p.title) * 1.4 +
        similarity(query, `${p.body} ${p.steps.join(" ")}`) +
        similarity(query, p.chapterTitle) * 0.6,
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.55) return null;
  const { p } = best;
  const steps = p.steps.slice(0, 5).map((s, i) => `${i + 1}. ${s}`);
  return {
    reply: [`**${p.title}**`, p.body, ...steps].filter(Boolean).join("\n"),
    proposals: [],
    suggestions: ranked
      .slice(1, 4)
      .filter((r) => r.p.chapter !== p.chapter && r.score > 0.4)
      .map((r) => `Comment ${r.p.title.toLowerCase()} ?`)
      .slice(0, 2),
    links: [
      { label: `Lire « ${p.chapterTitle} »`, href: `/guide#${p.chapter}` },
      { label: "Lancer la visite guidée", href: `/dashboard?tour=${p.chapter}` },
    ],
  };
}

/** Version texte du guide pour le prompt système (stable, donc mise en cache). */
export function guideDigest() {
  return chapters
    .map((c) =>
      [
        `## ${c.title} [${c.id}]`,
        c.guide.lead,
        ...c.guide.sections.map((s) =>
          [
            `### ${s.title}`,
            s.text ?? "",
            ...(s.steps ?? []).map((x, i) => `${i + 1}. ${x}`),
            ...(s.points ?? []).map((x) => `- ${x}`),
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        c.guide.tip ? `Astuce : ${c.guide.tip}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .concat(
      "## Glossaire\n" +
        glossary.map((g) => `- ${g.term} : ${g.definition}`).join("\n"),
    )
    .join("\n\n");
}
