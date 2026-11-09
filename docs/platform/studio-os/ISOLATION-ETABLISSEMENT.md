# Vérification de l'isolation par établissement

## Périmètre contrôlé

- Sécurité : incidents, journal, paramètres, présence de connexion, révocations de session et archives.
- SEO et visibilité locale : audits, observations IA, domaines et pages publiques propres au site.
- Connexions de prestataires : enregistrements et secrets associés à l'établissement.
- Hors ligne : appareils, quotas, opérations et décisions de conflit.

Les lectures du rôle applicatif sont limitées à l'établissement courant par les politiques SQL. Le compte de connexion est une identité commune : un même membre peut être autorisé dans plusieurs établissements, mais les données et les révocations de session restent attachées à chacun. Les pages publiques d'un site restent publiquement accessibles selon leur domaine et leur configuration SEO ; cela ne donne pas accès à l'administration d'un autre établissement.

## Écarts corrigés localement

Les requêtes d'archivage, de vérification et de purge du centre de sécurité indiquent désormais explicitement l'établissement, en plus des politiques SQL. Deux établissements peuvent conserver une archive distincte pour la même date. L'export d'archives et le filtre d'événements du centre de sécurité sont également bornés à l'établissement sélectionné, y compris pour un propriétaire.

La migration additive 048 refuse les liens incohérents entre établissements dans les quotas hors ligne, les allocations de stock, les opérations liées à une commande et les décisions de conflit. Les parcours existants restent autorisés lorsqu'ils appartiennent au même établissement.

## Vérification et limites

Les tests couvrent les lectures SQL de neuf tables sur deux établissements, deux archives à date identique, les filtres du centre de sécurité, le refus d'un quota et d'une décision de conflit croisés, ainsi que les parcours SEO et hors ligne existants. Les 35 tests ciblés passent, de même que le typage TypeScript.

Cette validation est locale. Les migrations 046 à 048 n'ont pas été déployées ni vérifiées sur la base hébergée. Avant le déploiement de 048, contrôler les éventuels liens hors ligne historiques déjà incohérents : le déclencheur bloque les nouvelles écritures et mises à jour concernées, sans réécrire les données antérieures.
