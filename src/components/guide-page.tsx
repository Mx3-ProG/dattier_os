/* Page /guide : le mode d’emploi écrit de atacuisine. Même contenu que la
   visite interactive du poste (features/guide/content.ts). */
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  Lightbulb,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { can, roleLabels, roles, type Permission } from "@/lib/permissions";
import { chapterRoles, chapters, glossary } from "@/features/guide/content";
import { chapterIcons } from "./tutorial/icons";
import { GuideToc } from "./guide-toc";

const matrix: [Permission, string][] = [
  ["orders", "Commandes"],
  ["kitchen", "Cuisine"],
  ["bar", "Bar"],
  ["payments", "Règlements"],
  ["reservations", "Réservations"],
  ["catalog", "Carte"],
  ["stock", "Stocks"],
  ["purchases", "Achats"],
  ["customers", "Clients"],
  ["team", "Équipe"],
  ["finance", "Finances"],
  ["website", "Site web"],
  ["settings", "Établissements"],
  ["security", "Sécurité"],
];

const service = [
  ["Commande", "Prise en salle, au QR code de table ou sur le site."],
  [
    "Préparation",
    "Les plats en cuisine, les boissons au bar, chacun à son rythme.",
  ],
  ["Prêt", "La salle est prévenue instantanément."],
  ["Service", "Chaque ligne est marquée servie."],
  ["Règlement", "Déclaré une fois pour toute la table, code promo compris."],
  ["Table libre", "Débarrassée, elle repart pour la tablée suivante."],
];
const stock = [
  ["Livraison", "Un lot avec sa date limite."],
  ["Réservé", "Dès l’envoi de la commande."],
  ["Consommé", "Au début de la préparation."],
  ["Perte", "Si une préparation commencée est annulée."],
];

const faq = [
  [
    "atacuisine encaisse-t-il l’argent en salle ?",
    "Non. Vous encaissez avec votre terminal de paiement ou en espèces, puis vous déclarez le règlement dans atacuisine. Les ventes, la fidélité et les rapports restent ainsi justes. Pour la commande en ligne, le paiement peut passer par Stripe.",
  ],
  [
    "Comment un client paie-t-il une commande sur le site ?",
    "À la dernière étape de la commande, il choisit « Au comptoir » (carte ou espèces au retrait) ou « En ligne » via Stripe. Il accepte les conditions de vente, valide, et suit sa commande sur une page de suivi.",
  ],
  [
    "Puis-je gérer plusieurs restaurants ?",
    "Oui. Chaque forfait inclut un établissement. Les établissements supplémentaires coûtent 39 € HT par mois chacun et bénéficient du même forfait.",
  ],
  [
    "Mes données sont-elles séparées de celles des autres restaurants ?",
    "Oui. Chaque établissement appartient à une seule organisation, et le cloisonnement est appliqué par l’application et par la base de données elle-même.",
  ],
  [
    "Que se passe-t-il si Internet coupe pendant le service ?",
    "Le poste de service hors ligne permet de préparer un appareil avec des quotas de stock et de continuer à prendre des commandes. Les tickets restent sur l’appareil et se réconcilient au retour du réseau.",
  ],
  [
    "Pourquoi je ne vois pas certains modules ?",
    "Chaque rôle n’affiche que les modules qu’il est autorisé à utiliser. Le tableau « Qui fait quoi » ci-dessus indique les accès de chaque rôle.",
  ],
  [
    "Comment relancer la visite guidée ?",
    "Dans le poste de travail, cliquez sur le bouton « Guide » en haut à droite : chaque parcours se relance en un clic et votre progression est mémorisée.",
  ],
];

export function GuidePage({ demo }: { demo: boolean }) {
  const toc = [
    { id: "comprendre", label: "Comprendre atacuisine" },
    { id: "service", label: "Le cycle d’un service" },
    { id: "roles", label: "Qui fait quoi" },
    ...chapters.map((c) => ({ id: c.id, label: c.title })),
    { id: "glossaire", label: "Glossaire" },
    { id: "questions", label: "Questions fréquentes" },
  ];
  const minutes = chapters.reduce((s, c) => s + c.minutes, 0);
  const tour = (id: string) => `/dashboard?tour=${id}`;
  return (
    <div className="landing guide">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          <UtensilsCrossed size={20} aria-hidden /> atacuisine
        </Link>
        <nav aria-label="Navigation du guide">
          <a href="#comprendre">Les bases</a>
          <a href="#order">Commandes</a>
          <a href="#payment">Règlement</a>
          <a href="#online">Paiement client</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link className="landing-btn primary small" href={tour("all")}>
          <Play size={15} aria-hidden /> Visite interactive
        </Link>
      </header>

      <main id="contenu" tabIndex={-1}>
        <section className="guide-hero">
          <span className="landing-eyebrow">Guide d’utilisation</span>
          <h1>
            atacuisine, <em>de A à Z.</em>
          </h1>
          <p className="landing-lead">
            Tout ce qu’il faut savoir pour faire tourner votre restaurant :
            créer votre carte, prendre et préparer les commandes, déclarer les
            règlements, gérer les stocks, fidéliser vos clients et vendre en
            ligne. Chaque chapitre se lit ici, et se pratique en direct dans le
            poste de travail.
          </p>
          <div className="guide-hero-actions">
            <Link className="landing-btn primary" href={tour("all")}>
              <Play size={17} aria-hidden /> Lancer la visite interactive
            </Link>
            {demo && (
              <Link className="landing-btn outline" href="/demo">
                Choisir un profil de démonstration
              </Link>
            )}
          </div>
          <dl className="guide-stats">
            <div>
              <dt>{chapters.length}</dt>
              <dd>parcours guidés</dd>
            </div>
            <div>
              <dt>{roles.length}</dt>
              <dd>rôles métier</dd>
            </div>
            <div>
              <dt>~{minutes} min</dt>
              <dd>pour tout découvrir</dd>
            </div>
          </dl>
        </section>

        <div className="guide-layout">
          <GuideToc items={toc} />
          <div className="guide-body">
            <section id="comprendre" className="guide-section">
              <span className="landing-eyebrow">Les bases</span>
              <h2>Comprendre atacuisine en deux minutes</h2>
              <p>
                atacuisine est un seul logiciel partagé par toute l’équipe.
                Chacun y travaille avec son propre écran, mais tout le monde lit
                et écrit les mêmes données, en temps réel.
              </p>
              <div className="guide-cards">
                <article>
                  <Building2 aria-hidden />
                  <h3>Organisation et établissements</h3>
                  <p>
                    Votre organisation regroupe vos établissements. Chaque
                    établissement a sa carte, ses tables, ses stocks, son équipe
                    et son site, parfaitement cloisonnés.
                  </p>
                </article>
                <article>
                  <ShieldCheck aria-hidden />
                  <h3>Un rôle, un écran</h3>
                  <p>
                    Salle, cuisine, bar, stocks, achats, comptabilité, manager,
                    propriétaire : chaque rôle ne voit que ses modules, et le
                    serveur revérifie chaque action.
                  </p>
                </article>
                <article>
                  <Network aria-hidden />
                  <h3>Tout est relié</h3>
                  <p>
                    Une recette relie la carte au stock ; une commande relie la
                    salle à la cuisine ; le site lit la même carte. Une
                    information saisie une fois est à jour partout.
                  </p>
                </article>
              </div>
              <h3 className="guide-sub">Les trois espaces</h3>
              <ul className="guide-spaces">
                <li>
                  <b>Le poste de travail</b> <code>/dashboard</code>
                  <span>
                    Le service au quotidien : salle, cuisine, bar, stocks,
                    clients, finances.
                  </span>
                </li>
                <li>
                  <b>L’administration</b> <code>/restaurant/…</code>
                  <span>
                    Équipe et invitations, boutique, fidélité, domaines, achats,
                    sécurité.
                  </span>
                </li>
                <li>
                  <b>Le site public</b> <code>/r/…</code>
                  <span>
                    Pour vos clients : carte, commande en ligne, réservation et
                    espace client.
                  </span>
                </li>
              </ul>
            </section>

            <section id="service" className="guide-section">
              <span className="landing-eyebrow">Vue d’ensemble</span>
              <h2>Le cycle d’un service</h2>
              <p>
                De la commande à la table libérée, voici le chemin parcouru par
                chaque commande, et ce qui se passe en parallèle dans le stock.
              </p>
              <ol className="guide-flow">
                {service.map(([t, d], i) => (
                  <li key={t}>
                    <span>{i + 1}</span>
                    <b>{t}</b>
                    <small>{d}</small>
                  </li>
                ))}
              </ol>
              <h3 className="guide-sub">Pendant ce temps, dans le stock</h3>
              <ol className="guide-flow stock">
                {stock.map(([t, d], i) => (
                  <li key={t}>
                    <span>{i + 1}</span>
                    <b>{t}</b>
                    <small>{d}</small>
                  </li>
                ))}
              </ol>
            </section>

            <section id="roles" className="guide-section">
              <span className="landing-eyebrow">Rôles et accès</span>
              <h2>Qui fait quoi</h2>
              <p>
                Un collaborateur peut cumuler plusieurs rôles. Le Super Admin
                est l’administrateur de la plateforme, pas un membre de
                l’équipe.
              </p>
              <div
                className="guide-matrix"
                role="region"
                aria-label="Tableau des accès"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Rôle</th>
                      {matrix.map(([p, l]) => (
                        <th scope="col" key={p}>
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roles
                      .filter((r) => r !== "SUPER_ADMIN")
                      .map((r) => (
                        <tr key={r}>
                          <th scope="row">{roleLabels[r]}</th>
                          {matrix.map(([p, l]) => (
                            <td key={p}>
                              {can(r, p) ? (
                                <Check size={15} aria-label={`${l} : oui`} />
                              ) : (
                                <span aria-label={`${l} : non`}>·</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {chapters.map((c, n) => {
              const Icon = chapterIcons[c.icon] || Sparkles;
              return (
                <section
                  id={c.id}
                  className="guide-section guide-chapter"
                  key={c.id}
                >
                  <div className="guide-chapter-head">
                    <span className="guide-chapter-icon">
                      <Icon aria-hidden />
                    </span>
                    <div>
                      <span className="landing-eyebrow">
                        Chapitre {String(n + 1).padStart(2, "0")} · ~{c.minutes}{" "}
                        min
                      </span>
                      <h2>{c.title}</h2>
                    </div>
                  </div>
                  <p className="guide-lead">{c.guide.lead}</p>
                  <p className="guide-roles">
                    {c.permission
                      ? `Profils concernés : ${chapterRoles(c).join(", ")}`
                      : "Pour tous les profils"}
                  </p>
                  {c.guide.sections.map((s) => (
                    <div className="guide-block" key={s.title}>
                      <h3>{s.title}</h3>
                      {s.text && <p>{s.text}</p>}
                      {s.steps && (
                        <ol className="guide-steps">
                          {s.steps.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ol>
                      )}
                      {s.points && (
                        <ul className="guide-points">
                          {s.points.map((x) => (
                            <li key={x}>
                              <Check size={15} aria-hidden />
                              <span>{x}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {c.guide.tip && (
                    <aside className="guide-tip">
                      <Lightbulb size={18} aria-hidden />
                      <p>{c.guide.tip}</p>
                    </aside>
                  )}
                  <Link className="guide-practice" href={tour(c.id)}>
                    <Play size={15} aria-hidden /> Pratiquer ce parcours dans le
                    poste ({c.steps.length} étapes)
                    <ArrowRight size={15} aria-hidden />
                  </Link>
                </section>
              );
            })}

            <section id="glossaire" className="guide-section">
              <span className="landing-eyebrow">Vocabulaire</span>
              <h2>Glossaire</h2>
              <dl className="guide-glossary">
                {glossary.map((g) => (
                  <div key={g.term}>
                    <dt>{g.term}</dt>
                    <dd>{g.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="questions" className="guide-section">
              <span className="landing-eyebrow">Questions fréquentes</span>
              <h2>Vous vous demandez peut-être…</h2>
              <div className="guide-faq">
                {faq.map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="guide-end">
              <h2>Prêt à passer à la pratique ?</h2>
              <p>
                La visite interactive vous guide sur les vrais écrans, adaptée à
                votre rôle. Vous pouvez agir vous-même à chaque étape.
              </p>
              <Link className="landing-btn primary" href={tour("all")}>
                <Play size={17} aria-hidden /> Lancer la visite interactive
              </Link>
            </section>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand">
          <UtensilsCrossed size={18} aria-hidden /> atacuisine
        </span>
        <nav aria-label="Liens utiles">
          <Link href="/">Accueil</Link>
          {demo && <Link href="/demo">Démonstration</Link>}
          {demo && <Link href="/site-demo">Exemple de site restaurant</Link>}
          <Link href="/platform">Espace client</Link>
        </nav>
        <small>© atacuisine · Logiciel libre sous licence AGPL-3.0</small>
      </footer>
    </div>
  );
}
