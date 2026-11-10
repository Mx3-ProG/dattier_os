/* Page /guide : le mode d’emploi écrit de STUDIO OS. Même contenu que la
   visite interactive du poste (features/guide/content.ts). */
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  Lightbulb,
  Mic,
  MessageSquareText,
  Wand2,
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
import { LegalLinks } from "./legal/legal-page";
import { PlatformCookieConsent } from "./legal/platform-cookie-consent";
import { packs, welcomeCredits, eur } from "@/features/assistant/pricing";

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
    "STUDIO OS encaisse-t-il l’argent en salle ?",
    "Non. Vous encaissez avec votre terminal de paiement ou en espèces, puis vous déclarez le règlement dans STUDIO OS. Les ventes, la fidélité et les rapports restent ainsi justes. Pour la commande en ligne, le paiement peut passer par Stripe.",
  ],
  [
    "Comment un client paie-t-il une commande sur le site ?",
    "À la dernière étape de la commande, il choisit « Au comptoir » (carte ou espèces au retrait) ou « En ligne » via Stripe. Il accepte les conditions de vente, valide, et suit sa commande sur une page de suivi.",
  ],
  [
    "Puis-je gérer plusieurs restaurants ?",
    "Oui. Chaque forfait inclut un établissement. Les établissements supplémentaires coûtent 39 € TTC par mois chacun et bénéficient du même forfait.",
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
    "Comment fonctionnent les crédits STUDIO VOICE ?",
    `Chaque organisation reçoit ${welcomeCredits} crédits à l’inscription. Une réponse du moteur réflexe (commandes, règlements, stocks, ventes, mode d’emploi) coûte 1 crédit ; une analyse par l’IA avancée coûte de 2 à 60 crédits selon sa longueur. Le solde, l’aide et la navigation sont gratuits. Un administrateur recharge depuis le bouton de solde, dans STUDIO VOICE.`,
  ],
  [
    "Comment relancer la visite guidée ?",
    "Dans le poste de travail, cliquez sur le bouton « Guide » en haut à droite : chaque parcours se relance en un clic et votre progression est mémorisée.",
  ],
];

export function GuidePage({ demo }: { demo: boolean }) {
  const toc = [
    { id: "bien-demarrer", label: "Bien démarrer, pas à pas" },
    { id: "comprendre", label: "Comprendre STUDIO OS" },
    { id: "service", label: "Le cycle d’un service" },
    { id: "roles", label: "Qui fait quoi" },
    { id: "cuisine-ia", label: "STUDIO VOICE, votre assistant" },
    ...chapters.map((c) => ({ id: c.id, label: c.title })),
    { id: "evolutions", label: "Évolutions et maintenance" },
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
          <UtensilsCrossed size={20} aria-hidden /> STUDIO OS
        </Link>
        <nav aria-label="Navigation du guide">
          <a href="#comprendre">Les bases</a>
          <a href="#cuisine-ia">STUDIO VOICE</a>
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
            STUDIO OS, <em>de A à Z.</em>
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
            <section id="bien-demarrer" className="guide-section">
              <span className="landing-eyebrow">Premier jour</span>
              <h2>Bien démarrer, pas à pas</h2>
              <p>
                Le parcours que la visite interactive propose en premier : du
                compte à la première table placée, dans l’ordre où les choses se
                font. Chaque étape renvoie à son chapitre détaillé.
              </p>
              <ol className="guide-starter">
                {chapters
                  .filter((c) => c.starter)
                  .map((c) => {
                    const Icon = chapterIcons[c.icon] || Sparkles;
                    return (
                      <li key={c.id}>
                        <a href={`#${c.id}`}>
                          <Icon size={18} aria-hidden />
                          <span>
                            <b>{c.title}</b>
                            <small>{c.summary}</small>
                          </span>
                        </a>
                      </li>
                    );
                  })}
              </ol>
              <Link className="guide-practice" href={tour("starter")}>
                <Play size={15} aria-hidden /> Lancer « Bien démarrer » dans le
                poste
                <ArrowRight size={15} aria-hidden />
              </Link>
            </section>

            <section id="comprendre" className="guide-section">
              <span className="landing-eyebrow">Les bases</span>
              <h2>Comprendre STUDIO OS en deux minutes</h2>
              <p>
                STUDIO OS est un seul logiciel partagé par toute l’équipe.
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

            <section id="cuisine-ia" className="guide-section guide-ia">
              <span className="landing-eyebrow">Nouveau</span>
              <h2>STUDIO VOICE, votre second qui ne dort jamais</h2>
              <p>
                STUDIO VOICE est l’assistant intégré au poste de travail et à
                l’administration. Vous lui parlez comme à un membre de l’équipe,
                à l’écrit ou à la voix : il comprend le service en cours,
                prépare les actions et vous propose la suite logique. Ouvrez-le
                avec le bouton flottant <b>STUDIO VOICE</b> en bas à droite, ou{" "}
                <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd>.
              </p>
              <div className="guide-cards">
                <article>
                  <Wand2 aria-hidden />
                  <h3>Il agit pour vous</h3>
                  <p>
                    « Commande table 4 : deux couscous agneau et un thé » : la
                    commande est prête, vous confirmez, elle part en cuisine et
                    au bar. Puis « encaisse la table 4 en espèces », « libère la
                    table 4 ».
                  </p>
                </article>
                <article>
                  <MessageSquareText aria-hidden />
                  <h3>Il répond à tout</h3>
                  <p>
                    Stocks sous le seuil, chiffre du jour, réservations de ce
                    soir, tables libres, prix d’un plat, et tout le mode
                    d’emploi de ce guide, avec un lien vers la visite guidée.
                  </p>
                </article>
                <article>
                  <Mic aria-hidden />
                  <h3>En temps réel, à la voix</h3>
                  <p>
                    Activez le micro : STUDIO VOICE écoute, répond à voix haute et
                    attend votre « oui » pour exécuter. Les mains restent sur le
                    service.
                  </p>
                </article>
              </div>
              <h3 className="guide-sub">Rien ne se fait sans vous</h3>
              <ol className="guide-steps">
                <li>Vous demandez, en phrase normale.</li>
                <li>
                  STUDIO VOICE prépare une carte d’action détaillée (plats,
                  quantités, total, alertes de stock).
                </li>
                <li>
                  Vous confirmez d’un clic ou d’un « oui ». Le serveur revérifie
                  vos droits, les stocks et les étapes, comme pour toute action.
                </li>
                <li>
                  STUDIO VOICE vous propose la suite : suivi, règlement, table.
                </li>
              </ol>
              <h3 className="guide-sub">Crédits</h3>
              <p>
                {welcomeCredits} crédits offerts à l’inscription. Réponse
                réflexe : 1 crédit. Analyse IA avancée : 2 à 60 crédits selon la
                longueur. Solde, aide et navigation : gratuits.
              </p>
              <ul className="guide-points">
                {packs.map((p) => (
                  <li key={p.id}>
                    <b>Pack {p.title}</b> : {p.credits.toLocaleString("fr-FR")}{" "}
                    crédits pour {eur(p.priceCents)} TTC · {p.hint}
                  </li>
                ))}
              </ul>
              <Link className="guide-practice" href="/dashboard">
                <Wand2 size={15} aria-hidden /> Essayer STUDIO VOICE dans le poste
                <ArrowRight size={15} aria-hidden />
              </Link>
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

            <section id="evolutions" className="guide-section">
              <span className="landing-eyebrow">Le produit dans la durée</span>
              <h2>Évolutions et maintenance</h2>
              <p>
                Studio ATS assure le développement, la maintenance et les
                corrections de STUDIO OS. Voici les repères de la version
                présentée dans ce guide.
              </p>
              <div className="guide-cards">
                <article>
                  <Sparkles aria-hidden />
                  <h3>STUDIO VOICE</h3>
                  <p>
                    Un assistant à l’écrit ou à la voix, qui prépare les actions
                    et vous laisse les confirmer. Les crédits et leur
                    utilisation sont expliqués dans ce guide.
                  </p>
                  <a href="#cuisine-ia">Comprendre STUDIO VOICE →</a>
                </article>
                <article>
                  <Building2 aria-hidden />
                  <h3>Votre site, à votre rythme</h3>
                  <p>
                    Le studio de création propose des modèles, l’ajout de médias
                    et un aperçu des pages avant publication, selon votre
                    forfait.
                  </p>
                  <Link href="/#modules">Retrouver les possibilités →</Link>
                </article>
                <article>
                  <ShieldCheck aria-hidden />
                  <h3>Maintenance et prochaines mises à jour</h3>
                  <p>
                    Aucun calendrier daté des prochaines livraisons n’est publié
                    ici pour le moment. Les fonctionnalités présentées ne
                    constituent pas une promesse de livraison future.
                  </p>
                  <Link href="/#contact">Contact et questions →</Link>
                </article>
              </div>
              <Link className="guide-practice" href="/">
                Revenir à l’accueil et aux offres{" "}
                <ArrowRight size={15} aria-hidden />
              </Link>
            </section>

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
          <UtensilsCrossed size={18} aria-hidden /> STUDIO OS
        </span>
        <nav aria-label="Liens utiles">
          <Link href="/">Accueil</Link>
          {demo && <Link href="/demo">Démonstration</Link>}
          {demo && <Link href="/site-demo">Exemple de site restaurant</Link>}
          <Link href="/platform">Espace client</Link>
          <LegalLinks />
        </nav>
        <small>© Wayne-web SAS · STUDIO OS, logiciel libre sous licence AGPL-3.0</small>
      </footer>
      <PlatformCookieConsent />
    </div>
  );
}
