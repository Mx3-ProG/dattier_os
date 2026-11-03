# Sécurité

Pour signaler une vulnérabilité, utilisez le signalement privé de vulnérabilité du dépôt GitHub lorsqu’il est activé. S’il n’est pas disponible, contactez le mainteneur par un canal privé déjà établi ; n’ouvrez pas de ticket public contenant des données d’exploitation ou des secrets.

Inclure : version/commit, périmètre affecté, prérequis, scénario reproductible sur données fictives et impact observé. Ne testez pas les établissements d’autrui. Le projet ne promet pas de délai de réponse ni de programme de récompense.

Les installations hébergées doivent utiliser un rôle PostgreSQL non propriétaire sans BYPASSRLS, une identité OIDC configurée, HTTPS, des sauvegardes externes restaurables et des secrets propres à chaque environnement. Le mode démonstration reste local et utilise des identités fictives.

Le journal d’activité et ses archives ne remplacent pas une sauvegarde. Les connecteurs sont désactivés tant que leur parcours réel et leurs exigences d’exploitation ne sont pas validés. L’application fournie n’est pas présentée comme une caisse certifiée, un moteur de paie ou un logiciel comptable validé.
