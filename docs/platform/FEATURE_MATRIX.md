# Matrice de reprise

| Fonction                                       | Origine       | Traitement                                                                                                                                             |
| ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Salle, éditeur et réservations visuelles       | Studio OS     | Conservés ; établissement paramétrable pour la réservation                                                                                             |
| Commandes, cuisine/bar, lots et recettes       | Commun        | Services existants, transactions et contraintes conservés                                                                                              |
| Catalogue, archivage, promotions nominatives   | Studio OS     | Conservés, permissions cumulées et périmètre SQL                                                                                                       |
| Boutique, choix, créneaux, prix serveur, suivi | Donuts        | Services adaptés via `commerce(restaurant)` ; aucun identifiant Donuts imposé                                                                          |
| Historique et nouvelle commande                | Donuts        | Repris dans l’espace client ; accès par identité OIDC et organisation                                                                                  |
| Authentification client et récupération        | Donuts        | Remplacées par OIDC/Keycloak ; aucun mot de passe local importé                                                                                        |
| Avis et modération                             | Donuts        | Tables et service repris ; interface de modération propre au restaurant                                                                                |
| Fidélité et récompenses                        | Commun/Donuts | Services repris et portefeuille d’organisation ajouté                                                                                                  |
| Édition du site                                | Donuts        | Studio original repris : sections, pages, story, identité, couleurs/polices, SEO, aperçus, verrous et versions par établissement                       |
| Médias                                         | Donuts        | Médiathèque complète image/vidéo, limites, S3, références tenant et contrôle de publication ; aucun disque Donuts copié                                |
| Centre de sécurité                             | Donuts        | Centre complet repris : journal, incidents, corrections prédéfinies, approbations, connexions, archives et intégrité ; exécution par worker persistant |
| Cookies, contenus juridiques, cartes externes  | Donuts        | Préférences cookies par établissement et blocage des cartes/vidéos externes ; modèles juridiques personnalisables à compléter par l’exploitant         |
| Stripe test                                    | Donuts        | Ancienne configuration globale non reprise ; paiement en ligne désactivé en attendant un connecteur marchand validé                                    |
| Organisations, équipes et invitations          | Nouveau       | Modèle, API et écrans dédiés                                                                                                                           |
| Inventaires, achats multilignes et conversions | Nouveau       | Brouillons, validation, réceptions et historique                                                                                                       |
| Hors ligne                                     | Nouveau       | Quotas réservés, file IndexedDB, synchronisation et conflits                                                                                           |

La branche Donuts source n’est pas modifiée. Les identités, médias et contenus de sa marque ne sont pas copiés dans la plateforme. Cette matrice distingue les reprises effectives des fonctionnalités qui demandent encore un portage ou un raccordement.
