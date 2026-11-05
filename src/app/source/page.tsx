import type { Metadata } from "next";
import Link from "next/link";
import "@/components/platform/platform.css";
import "./source.css";
import {
  CURRENT_VERSION,
  current,
  daysUntil,
  formatDate,
  next,
  releases,
} from "@/lib/releases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Code source, versions et maintenance · Dattier OS",
  description:
    "Dattier OS est un logiciel libre (AGPL-3.0) maintenu dans la durée : une mise à jour tous les 6 mois, des correctifs entre les deux.",
};

const repo = () =>
  process.env.SOURCE_URL || "https://github.com/Mx3-ProG/dattier_os";

export default function Page() {
  const minors = releases.filter((r) => r.kind !== "corrective");
  const supportRows = minors
    .filter((r) => r.version.startsWith("1."))
    .slice(0, 3)
    .map((r) => {
      const i = minors.indexOf(r);
      return {
        line: r.version.replace(/\.0$/, ".x"),
        full: minors[i + 1]?.date,
        security: minors[i + 2]?.date,
      };
    });

  return (
    <main className="platform source-page">
      <p>
        <Link href="/">← Retour à l’accueil</Link>
      </p>
      <h1>Dattier OS, logiciel libre et maintenu</h1>
      <p>
        Le code de cette version est distribué sous AGPL-3.0, sous réserve des
        notices tierces et des droits sur les contenus. Il évolue selon un
        calendrier public : une mise à jour importante tous les six mois, des
        correctifs entre les deux.
      </p>

      <section className="source-current" aria-labelledby="version">
        <div>
          <span className="source-eyebrow">Version en service</span>
          <h2 id="version">v{CURRENT_VERSION}</h2>
          <p className="muted">
            {current.title}, publiée le {formatDate(current.date)}.
          </p>
        </div>
        {next && (
          <div>
            <span className="source-eyebrow">Prochaine mise à jour</span>
            <h2>v{next.version}</h2>
            <p className="muted">
              Prévue le {formatDate(next.date)}, dans {daysUntil(next.date)}{" "}
              jours.
            </p>
          </div>
        )}
      </section>

      <section id="calendrier" aria-labelledby="calendrier-titre">
        <h2 id="calendrier-titre">Calendrier des versions</h2>
        <p>
          Une version mineure sort le premier mardi de mai et de novembre. Les
          dates à venir sont prévisionnelles et ne changent qu’avec une annonce
          publique au moins un mois avant.
        </p>
        <ol className="source-timeline">
          {releases.map((r) => {
            const state =
              r.version === CURRENT_VERSION
                ? "current"
                : r.released
                  ? "released"
                  : "planned";
            return (
              <li key={r.version} data-state={state}>
                <span className="source-dot" aria-hidden />
                <div>
                  <p className="source-line">
                    <strong>v{r.version}</strong>
                    <time dateTime={r.date}>{formatDate(r.date)}</time>
                    <span className="source-badge">
                      {state === "current"
                        ? "Version actuelle"
                        : state === "released"
                          ? "Publiée"
                          : "Prévue"}
                    </span>
                  </p>
                  <h3>{r.title}</h3>
                  <ul>
                    {r.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section id="maintenance" aria-labelledby="maintenance-titre">
        <h2 id="maintenance-titre">Maintenance et support</h2>
        <div className="grid">
          <article>
            <h3>Mineure tous les 6 mois</h3>
            <p>
              Nouvelles fonctionnalités et mise à niveau du socle technique, par
              exemple de la 1.0.1 à la 1.1.0. Compatible avec la version
              précédente.
            </p>
          </article>
          <article>
            <h3>Correctifs mensuels</h3>
            <p>
              Corrections de bugs le premier mardi du mois si nécessaire. Les
              failles de sécurité sont corrigées sans attendre le calendrier.
            </p>
          </article>
          <article>
            <h3>Majeure annoncée à l’avance</h3>
            <p>
              Une version 2.0 serait annoncée au moins six mois avant, avec une
              migration accompagnée. Aucune n’est planifiée aujourd’hui.
            </p>
          </article>
        </div>
        <div className="source-table">
          <table>
            <caption>
              Chaque version mineure est maintenue environ douze mois.
            </caption>
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Toutes corrections jusqu’au</th>
                <th scope="col">Sécurité jusqu’au</th>
              </tr>
            </thead>
            <tbody>
              {supportRows.map((s) => (
                <tr key={s.line}>
                  <th scope="row">{s.line}</th>
                  <td>{s.full ? formatDate(s.full) : "À définir"}</td>
                  <td>{s.security ? formatDate(s.security) : "À définir"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="code" aria-labelledby="code-titre">
        <h2 id="code-titre">Code source et licence</h2>
        <p>
          <a href={repo()}>Consulter le dépôt source</a> ·{" "}
          <a href={`${repo()}/blob/main/CHANGELOG.md`}>Journal des versions</a>{" "}
          ·{" "}
          <a href={`${repo()}/blob/main/docs/RELEASES.md`}>
            Politique de versions
          </a>
        </p>
        <p>
          L’exploitant d’une version modifiée doit fournir l’accès au code
          correspondant. Pour une instance modifiée, SOURCE_URL doit pointer
          vers les sources exactes utilisées.
        </p>
      </section>
    </main>
  );
}
