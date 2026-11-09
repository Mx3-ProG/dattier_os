# Séparer les sites publics du tableau de bord

**Statut : plan complet validé le 9 novembre 2026, rien n'est implémenté.**

Effort total estimé : **14 à 20 jours de développement**, plus 1 à 2 semaines d'observation de la CSP. La CSP (lot 2) peut être livrée seule en 3 à 4 jours.

Cette analyse porte sur `claude/tenant-isolation`, la branche la plus avancée au moment de l'audit. Ses changements alors non commités sont depuis dans le commit `922fbb2`, et les fichiers audités n'y ont pas changé. Il utilise les noms `atacuisine_*` là où `main` utilise `dattier_*` : les noms de cookies dépendront de la réconciliation des branches. Aucun prototype n'a été exécuté, et les chiffres sont des estimations.

## Le problème

- **Même origine.** `/r/<restaurant>` s'affiche sur l'origine du tableau de bord. Le cookie d'identité est `HttpOnly`, mais un script injecté n'a pas besoin de le lire : il peut appeler les API du personnel avec ce cookie et lire les réponses. `assertOrigin` les laisse passer, car la requête vient de la bonne origine.
- **Les domaines personnalisés ne suffisent pas.** Même avec un domaine propre, `/compte`, `/panier`, `/checkout` et `/suivi` renvoient vers `APP_URL/r/<id>` (`src/components/cms-site/context.tsx`).
- **L'aperçu de l'éditeur est le cas le plus exposé.** `?cms=draft` affiche le contenu du tenant dans une iframe de même origine, avec la session du personnel (`src/components/site-editor/index.tsx`).
- **La CSP n'a pas de `script-src`.** Elle ne limite donc aucun script (`next.config.ts`).

## Audit : aucune XSS trouvée

Il n'existe aucune fonction « code personnalisé » : le contenu d'un tenant passe par un schéma et par l'échappement de React.

| Emplacement | Donnée | Verdict | Action |
|---|---|---|---|
| `src/app/r/[restaurant]/[[...page]]/page.tsx:211` (JSON-LD) | Contenu du tenant | Sûr : bloc de données non exécuté, `<`, `>`, `&`, U+2028 et U+2029 échappés, test dans `tests/seo.test.ts` | Aucune |
| `src/components/cms-site/cookie-consent.tsx:73` | Identifiant du restaurant, vérifié en base | Sûr, mais c'est un script exécuté | Lui donner le nonce (lot 2) |
| `src/components/cms-site/account/referral.tsx:134` | SVG produit par `qrcode` | Sûr : le SVG ne reprend que des tracés et des couleurs | Facultatif : `<img>` en `data:` |
| `src/components/platform/referral-program.tsx:284` | Idem, couleurs fixes | Sûr | Idem |
| `src/components/qr/qr.tsx:46` | Idem | Sûr | Idem |
| `src/components/qr/qr.tsx:91` (`document.write`) | Libellés échappés par `escapeHtml` | Sûr, mais son `<script>` sera bloqué par la CSP héritée | Appeler `w.print()` depuis la page parente (lot 2) |
| `src/components/cms-site/store.tsx:1443` (`<style>`) | Couleurs `#RRGGBB`, polices dans une liste fermée | Sûr | Aucune |
| Liens du CMS | `SAFE_HREF` : chemins internes, `https`, `tel`, `mailto` | Sûr ; React 19 bloque aussi `javascript:` | Aucune |
| Médias envoyés | Réencodés en WebP ou MP4, `MEDIA_REF` n'accepte pas les SVG envoyés | Sûr | Ajouter `sandbox` en défense (lot 1) |

## Architecture proposée

```text
app.dattier.fr             tableau de bord, Keycloak, callback OIDC, cookie du personnel
<slug>.dattier-sites.fr    site public et compte client, cookie client propre à l'hôte
www.mon-restaurant.fr      idem, si un domaine vérifié existe (déjà pris en charge)
```

Les noms de domaine sont des exemples. `SITES_BASE_DOMAIN` active la séparation ; sans cette variable, le comportement actuel est conservé (mode démo et auto-hébergeurs).

### Domaine

**Recommandation : un domaine enregistrable distinct, avec un sous-domaine par restaurant.**

| Option | Personnel protégé | Tenants isolés entre eux | Limite |
|---|---|---|---|
| **`<slug>.dattier-sites.fr`** (recommandé) | Oui | Oui | Certificat wildcard par challenge DNS-01 |
| `<slug>.sites.dattier.fr` | En partie | Oui | Même site : les cookies `SameSite=Lax` restent envoyés, et le dépôt de cookies sur le domaine parent reste possible |
| `sites.dattier.fr/r/<slug>` | En partie | **Non** | Une XSS chez A atteint les comptes clients de B |

- **Exploitation :** un DNS wildcard, un certificat wildcard et un reverse proxy qui conserve `Host`.
- **Slug :** les identifiants de restaurant sont des UUID, valides en DNS mais peu présentables. J'ajouterais une colonne `site_slug` unique, fixe après création, avec une liste de noms réservés.

### Cookies

| Cookie | Hôte | Audience | Règle |
|---|---|---|---|
| `__Host-…_identity` (personnel) | Plateforme | `…-web` | Refusé sur les hôtes de site |
| `__Host-…_customer` (client) | Hôte du site | `…-site`, plus l'identifiant du restaurant | Refusé sur la plateforme et sur les autres restaurants |
| `__Host-…_site_flow` (connexion) | Hôte du site | Flux de connexion | Durée de 10 minutes |

- **Préfixe `__Host-` :** il interdit l'attribut `Domain`, donc le dépôt depuis un sous-domaine. Il exige HTTPS : les noms actuels restent en HTTP local.
- **Clé dédiée :** le jeton client est signé avec une clé dérivée de `SESSION_SECRET` par HKDF, pas avec la clé du personnel.
- **Effet sur les utilisateurs :** une reconnexion unique au moment du renommage.

### Compte client sur le site public

Keycloak n'accepte pas de joker dans le nom d'hôte d'une URL de retour, et les domaines personnalisés s'ajoutent à chaud. La plateforme sert donc d'intermédiaire, sans changer la configuration Keycloak :

1. Le site crée `state` et `verifier`, les garde dans `…_site_flow`, puis redirige vers `APP_URL/auth/site/start` avec le restaurant et le hash du `verifier`.
2. La plateforme lance le flux OIDC existant.
3. Au retour, elle **ne pose pas le cookie du personnel**. Elle crée un code à usage unique valable 60 secondes, stocké haché dans une nouvelle table `site_login_codes`.
4. Elle redirige vers l'hôte du restaurant, **lu en base et jamais depuis un paramètre**.
5. Le site consomme le code avec son `verifier`, puis pose le cookie client.

Dans `src/app/api/store/[restaurant]/[action]/route.ts`, `customerActor(restaurant)` remplace `actor()`. `customerForActor` ne change pas. Les liens `/compte`, `/panier`, `/checkout` et `/suivi` restent alors sur le site. La déconnexion ne touche que le cookie client, et `prompt=login` évite une reconnexion silencieuse via Keycloak.

Un client se connecte séparément sur chaque site d'une même organisation, mais retrouve le même compte. Cette friction est le prix de l'isolation.

### Aperçu de l'éditeur

L'aperçu passe sur l'hôte du site, sans session du personnel :

- La plateforme vérifie `siteScope`, puis émet un jeton de 10 minutes (audience `…-preview`, restaurant, utilisateur, version).
- Le jeton passe dans l'URL plutôt que dans un cookie, car les cookies tiers sont bloqués dans les iframes par certains navigateurs. La réponse est en `no-store` et `Referrer-Policy: no-referrer`.
- Chaque chargement rejoue le contrôle d'appartenance : une révocation s'applique donc immédiatement.
- `postMessage` vise l'origine exacte de l'autre fenêtre, au lieu de `location.origin` (`store.tsx:156`, `site-editor/index.tsx:370`).
- L'hôte du site autorise l'intégration avec `frame-ancestors <APP_ORIGIN>`, et `X-Frame-Options` disparaît sur ces hôtes.

### CSP

Le proxy génère un nonce par requête ; Next.js l'applique à ses scripts. Le coût habituel (perte du rendu statique) est ici quasi nul, car le layout racine lit déjà `headers()` et `cookies()`, ce qui rend les pages dynamiques.

```text
default-src 'self';
script-src 'self' 'nonce-<aléatoire>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self';
media-src 'self' blob:;
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'none';
form-action 'self';
```

| Directive | Tableau de bord | Site public |
|---|---|---|
| `frame-src` | `'self'`, puis `https://*.<SITES_BASE_DOMAIN>` | Google Maps, `youtube-nocookie`, Vimeo |
| `frame-ancestors` | `'self'` jusqu'au lot 5, puis `'none'` | `<APP_ORIGIN>` |

Points d'attention :

- **Plusieurs CSP s'additionnent.** Celle de `next.config.ts` doit disparaître des pages, sinon `frame-ancestors 'self'` bloquerait l'aperçu.
- **`style-src` reste en `'unsafe-inline'`.** L'exemple de la documentation Next.js met un nonce dans `style-src`, ce qui bloquerait les attributs `style={{…}}` utilisés dans l'application.
- **Tous les chemins du proxy doivent poser la CSP,** y compris les retours anticipés du mode démo.
- **`/offline` est mis en cache par le service worker.** L'en-tête et le HTML conservés gardent le même nonce : à tester, sur une page au contenu statique.
- **SRI écarté :** la fonction est encore expérimentale, et le rendu dynamique n'en a pas besoin.
- **`unsafe-eval` en développement uniquement,** comme l'exige React.

## Lots et effort

| Lot | Contenu | Effort |
|---|---|---|
| **1. Durcissement immédiat** | `Content-Security-Policy: sandbox; default-src 'none'` sur les routes de médias | 0,5 à 1 j |
| **2. CSP** | Politique et tests (1 j), proxy et nonce du bandeau cookies (1 j), impression des QR et collecte des rapports (0,5 j), `Report-Only` puis application (0,5 à 1,5 j) | 3 à 4 j |
| **3. Hôtes de site** | `site_slug` et résolution (1 j), proxy, `assertOrigin` et préfixe des liens (0,5 à 1 j), URL canoniques et sitemaps (0,5 j), tests et guide d'exploitation (0,5 à 1 j) | 2,5 à 3,5 j |
| **4. Compte client** | Parcours de connexion et table des codes (1,5 à 2 j), `customerActor` (0,5 j), liens et déconnexion (0,5 j), tests (0,5 à 1 j) | 3 à 4 j |
| **5. Aperçu de l'éditeur** | Jeton (0,5 à 1 j), iframe et `postMessage` (1 à 1,5 j), tests (0,5 j) | 2 à 3 j |
| **6. Migration et bascule** | Redirections, retours Stripe, QR, essai sur copie, bascule | 2 à 3 j |
| **7. Serrage final** | Hôtes de site limités aux API publiques, `frame-ancestors 'none'`, documentation | 0,5 à 1 j |
| **Total** | | **14 à 20 j** |

Ordre conseillé : 1 et 2 d'abord (indépendants, utiles immédiatement), puis 3 à 5 derrière `SITES_BASE_DOMAIN`, enfin 6 et 7. Le travail doit démarrer après la réconciliation de `main` et de la branche de consolidation, encore en cours. Les migrations des lots 3 et 4 (`site_slug`, `site_login_codes`) prendront leur numéro après celle de la réconciliation, prévue en 063 : numéroter au moment de la fusion.

## Migration des liens

| Lien existant | Traitement |
|---|---|
| `/r/<id>/…` sur la plateforme, dont tous les liens du tableau de bord | Redirection vers le domaine principal ou `<slug>.<SITES_BASE_DOMAIN>`, en conservant le chemin et la requête. **Ces liens internes peuvent rester tels quels.** |
| QR imprimés (`/q/<token>`) | Ils restent valables : la route reste sur la plateforme et redirige directement vers l'hôte du site (`src/features/qr/service.ts`) |
| Retour Stripe | `back` doit utiliser l'hôte du site (`src/features/payments/service.ts:327`). Les paiements en cours passent par la redirection, et le navigateur conserve le fragment `#<token>`. |
| `?cms=draft` sur la plateforme | Plus d'affichage sur la plateforme ; redirection vers l'éditeur |
| SEO | `seo/urls.ts` et le sitemap d'index déclarent les nouveaux hôtes ; le mode `mirror` existe déjà |
| Parrainage | Redirection pour les anciens liens ; les nouveaux sont construits depuis l'hôte du site |

**Déroulé de la bascule :**

1. Passer en **307 pendant deux semaines**, car un 308 reste en cache dans les navigateurs et empêcherait le retour arrière.
2. Passer ensuite en 308.
3. Pour revenir en arrière pendant la phase 307, il suffit de retirer `SITES_BASE_DOMAIN`.

**Pertes acceptées à la bascule,** car le stockage du navigateur ne suit pas le changement d'origine :

- Le panier en cours est perdu et le choix sur les cookies est redemandé.
- Le suivi d'une commande invité enregistré uniquement dans le navigateur est perdu, sauf si le client a gardé son lien.
- Il faut donc basculer hors service, et prévoir une reconnexion unique des clients.

## Tests à ajouter

Dans `npm run test:isolation`, section HTTP :

- Le cookie du personnel est sans effet sur un hôte de site.
- Le cookie client est refusé sur la plateforme et chez un autre restaurant.
- Les API du personnel répondent 403 sur un hôte de site.
- Un code de connexion rejoué, expiré ou présenté sans le bon `verifier` est refusé.
- Le jeton d'aperçu est refusé pour un autre restaurant et après révocation.
- Le nonce change à chaque requête, et aucune page ne sert deux CSP.

Dans Playwright, avec des hôtes `*.localhost` : parcours client complet, aperçu de l'éditeur et absence de violation CSP sur le parcours principal.

## Risques restants

- **Une XSS sur un site atteint encore les clients de ce restaurant.** Le plan protège le personnel et les autres tenants, pas les données du site touché.
- **Une XSS dans le tableau de bord reste grave.** Il affiche aussi des données saisies par des clients et des tenants ; seule la CSP aide ici.
- **`style-src 'unsafe-inline'`** laisse possible une exfiltration limitée par CSS.
- **Les Trusted Types restent hors périmètre :** ils demanderaient d'adapter les usages de `dangerouslySetInnerHTML`.

## À vérifier

- **Possible bogue actuel :** le proxy refuse `/api/media/<r>/<asset>` sur les domaines personnalisés, car `media` manque de son expression régulière. Reste à vérifier si une page publique sert ces URL ; à traiter au lot 3.
- **Nonce :** à éprouver dès le début du lot 2 avec Next.js 16.4 et `skipProxyUrlNormalize`.
- **Keycloak :** l'absence de joker d'hôte vient de ma connaissance du produit, pas d'un test sur la version 26.8. Le parcours proposé n'en dépend pas.

## Décisions validées

1. **Domaine :** un domaine enregistrable distinct, avec un sous-domaine par restaurant. Le nom reste à choisir.
2. **Adresses :** un `site_slug` plutôt que l'UUID dans l'adresse.
3. **Pertes de bascule :** panier, choix sur les cookies et reconnexion des clients.
4. **Périmètre :** le plan complet, lots 1 à 7.
