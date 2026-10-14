# Vercel — préparation future, aucun déploiement effectué

Prérequis bloquant : terminer et tester l’adaptateur PostgreSQL distant, l’authentification réelle et les politiques RLS décrits dans SUPABASE_DEPLOYMENT.md. Le dossier `.data` n’est pas un stockage persistant pour une fonction Vercel. Le garde `VERCEL` bloque intentionnellement le mode local.

1. Après autorisation, importer le dépôt dans un nouveau projet Vercel, framework Next.js. Définir une version Node supportée compatible et utiliser `npm ci` et `npm run build`.
2. Séparer les environnements preview et production et leurs bases. Ajouter les secrets dans les variables serveur. Désactiver complètement `DATTIER_DEMO` et les routes associées en production.
3. Appliquer les migrations validées par une étape contrôlée avant le déploiement ; ne pas exécuter de seed de démo ou de migration destructive à chaque invocation HTTP.
4. Définir l’origine canonique HTTPS et les URLs de retour Auth. Corriger sitemap, metadata par page et robots uniquement après validation des données restaurant, textes légaux et consentements.
5. Configurer pool PostgreSQL compatible fonctions, limites de connexions et timeouts. Prévoir cache uniquement pour les projections publiques appropriées ; aucune mise en cache partagée de données privées.
6. Déployer d’abord en preview protégée. Tester de vrais comptes, les accès inter-établissements interdits, la concurrence, les stocks, les statuts cuisine/bar, les réservations, les médias et les erreurs fournisseur.
7. Vérifier responsive, accessibilité clavier, console navigateur, logs serveur, permissions et restauration de sauvegarde. Activer production seulement après approbation de l’opérateur.

La V0 compile localement en mode production ; cela ne signifie pas qu’un déploiement distant est opérationnel. Aucun projet, domaine, variable ou ressource Vercel existant n’a été modifié.
