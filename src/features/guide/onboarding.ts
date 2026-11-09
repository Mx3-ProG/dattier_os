/* Parcours « Bien démarrer » : on prend le restaurateur par la main, du compte
   à la première table placée. Plus les parcours SEO et hors ligne. Assemblés
   avec les autres dans content.ts. */
import type { Chapter } from "./content";

export const account: Chapter = {
  id: "account",
  title: "Votre compte et votre espace",
  icon: "UserRound",
  permission: null,
  starter: true,
  summary:
    "Comment le compte se crée, ce qu’est votre organisation, et où retrouver votre profil.",
  minutes: 2,
  steps: [
    {
      title: "Bienvenue, on vous accompagne",
      body: "Ce parcours « Bien démarrer » vous emmène pas à pas : personnaliser votre espace, renseigner votre établissement, inviter votre équipe, créer vos ingrédients, votre carte et placer vos tables. Chaque étape se fait sur les vrais écrans ; vous pouvez quitter avec Échap et reprendre depuis le bouton Guide.",
    },
    {
      title: "Votre compte, en trois temps",
      body: "1. Sur la page de connexion, « Créer un compte » : vous vous inscrivez avec votre adresse e-mail, qui est vérifiée. 2. Vous choisissez une offre : elle crée votre organisation. 3. Vous créez votre premier restaurant : il démarre vide, prêt à être configuré. Si vous voyez cet écran, ces trois étapes sont faites.",
      link: { label: "Revoir la création de compte", href: "/guide#account" },
    },
    {
      title: "Organisation, restaurants, équipe",
      body: "Votre organisation regroupe vos restaurants. Chaque restaurant a ses propres données (carte, tables, stocks, site) et sa propre équipe. Vos collaborateurs n’achètent rien : vous les invitez, ils créent leur compte avec l’adresse invitée.",
    },
    {
      target: '[data-tour="restaurant-switch"]',
      title: "Le restaurant affiché",
      body: "Tout ce que vous faites s’applique au restaurant choisi ici. Si vous en gérez plusieurs, changez-en à tout moment.",
    },
    {
      target: '[data-tour="profile"]',
      title: "Votre profil",
      body: "Votre nom et votre rôle. C’est aussi la porte de l’administration du restaurant : équipe, boutique, site, SEO, stocks et sécurité. Nous y passerons ensemble dans quelques minutes.",
    },
  ],
  guide: {
    lead: "Avant d’entrer dans le poste de travail, il faut un compte, une organisation et un premier restaurant. Tout se fait en ligne, en quelques minutes.",
    sections: [
      {
        title: "Créer un compte",
        steps: [
          "Ouvrez la page de connexion et cliquez sur « Créer un compte ».",
          "Inscrivez-vous avec votre adresse e-mail ; elle est vérifiée avant la première connexion.",
          "Choisissez une offre : votre organisation est créée.",
          "Depuis « Mes restaurants », créez votre premier établissement.",
          "Ouvrez son poste de travail : la visite « Bien démarrer » se lance.",
        ],
      },
      {
        title: "Rejoindre une équipe existante",
        text: "Un collaborateur ne crée pas d’organisation : il reçoit un lien d’invitation, crée son compte avec l’adresse invitée, puis accepte l’invitation depuis « Mes restaurants ». Ses rôles ont été choisis par la personne qui l’a invité.",
      },
      {
        title: "En démonstration",
        text: "La démonstration n’a pas d’inscription : la page de connexion propose directement des profils fictifs (propriétaire, salle, cuisine…).",
      },
    ],
  },
};

export const appearance: Chapter = {
  id: "appearance",
  title: "Personnaliser votre espace",
  icon: "Palette",
  permission: null,
  starter: true,
  summary:
    "Mode jour ou nuit, couleur, typographie, taille des textes et couleurs des activités.",
  minutes: 2,
  steps: [
    {
      target: ".appearance-trigger",
      title: "Votre espace, à votre goût",
      body: "Avant de commencer, mettez-vous à l’aise. Ces réglages ne concernent que vous : chaque membre de l’équipe a les siens, et ils vous suivent dans tous vos restaurants.",
      action: "Cliquez sur « Personnaliser mon espace ».",
      autoClick: true,
      fallback:
        "Le bouton « Personnaliser mon espace » se trouve sous le logo, en haut de la barre latérale.",
    },
    {
      target: ".appearance-modes",
      title: "Jour ou nuit",
      body: "Le mode Nuit repose les yeux en soirée ou dans une cuisine sombre ; le mode Jour est plus lisible en pleine lumière. Essayez les deux : l’aperçu change tout de suite.",
      fallback: "Ouvrez d’abord « Personnaliser mon espace ».",
    },
    {
      target: ".appearance-palettes",
      title: "Une couleur d’ambiance",
      body: "Six palettes prêtes à l’emploi colorent les boutons et les repères. Le texte reste toujours lisible : les contrastes sont calculés pour vous.",
    },
    {
      target: ".appearance-color",
      title: "Ou votre propre couleur",
      body: "Choisissez exactement la teinte de votre restaurant avec le sélecteur de couleur.",
    },
    {
      target: ".appearance-font",
      text: "Typographie",
      title: "La typographie",
      body: "Quatre polices : l’actuelle, Inter (nette), Nunito (arrondie) ou Poppins (géométrique). Elles sont installées avec l’application, sans téléchargement.",
    },
    {
      target: ".appearance-font",
      text: "Taille des textes",
      title: "La taille des textes",
      body: "Confort, Grand ou Très grand : idéal sur une tablette posée au passe, ou pour un collaborateur qui lit mieux en grand.",
    },
    {
      target: ".appearance-category-settings",
      title: "Les couleurs des activités",
      body: "Chaque famille d’activité (salle, cuisine, stocks…) a sa couleur dans la navigation, le journal et les modules. Les statuts et alertes, eux, gardent toujours leur signification.",
    },
    {
      target: ".appearance-save",
      title: "Enregistrer",
      body: "Rien n’est appliqué tant que vous n’enregistrez pas : « Annuler » ou Échap abandonnent l’essai. « Rétablir l’apparence d’origine » revient aux réglages de départ.",
      action: "Cliquez sur « Enregistrer » pour garder vos choix, ou passez.",
    },
    {
      closeModal: true,
      target: ".appearance-mode-toggle",
      title: "Le raccourci jour / nuit",
      body: "Le petit bouton soleil / lune bascule directement entre jour et nuit, sans ouvrir le panneau. Le choix est enregistré aussitôt.",
    },
  ],
  guide: {
    lead: "Chaque membre de l’équipe personnalise son propre espace. Les réglages sont enregistrés sur son profil et le suivent dans tous ses restaurants et sur tous ses appareils.",
    sections: [
      {
        title: "Pas à pas",
        steps: [
          "Barre latérale › « Personnaliser mon espace ».",
          "Choisissez le mode Jour ou Nuit.",
          "Choisissez une palette, ou votre propre couleur.",
          "Réglez la typographie et la taille des textes.",
          "Ajustez si besoin les couleurs des activités.",
          "Cliquez sur « Enregistrer ».",
        ],
      },
      {
        title: "Bon à savoir",
        points: [
          "Le bouton soleil / lune bascule le mode sans ouvrir le panneau.",
          "Fermer, Annuler ou Échap abandonnent les changements non enregistrés.",
          "Les contrastes sont vérifiés : le texte reste lisible quelle que soit la couleur.",
          "Les statuts (prêt, alerte…) gardent leurs couleurs pour ne jamais prêter à confusion.",
          "Sans réseau, votre dernier thème reste appliqué.",
        ],
      },
    ],
  },
};

export const setup: Chapter = {
  id: "setup",
  title: "Renseigner votre établissement",
  icon: "Building2",
  permission: ["settings"],
  starter: true,
  summary:
    "Le nom, l’adresse, le téléphone et l’objectif du jour de votre restaurant.",
  minutes: 2,
  steps: [
    {
      module: "settings",
      target: ".two-grid .card",
      title: "La fiche de votre restaurant",
      body: "Ces informations apparaissent sur votre site, vos tickets et vos messages aux clients. Prenez une minute pour les vérifier.",
      fallback:
        "Les informations de l’établissement sont modifiables par le propriétaire.",
    },
    {
      module: "settings",
      target: '.two-grid .card input[name="name"]',
      title: "Le nom",
      body: "Le nom affiché partout : poste, site public, confirmations de commande.",
    },
    {
      module: "settings",
      target: '.two-grid .card input[name="address"]',
      title: "L’adresse et le téléphone",
      body: "Ce sont eux que vos clients voient pour venir ou vous appeler. Le téléphone est facultatif.",
    },
    {
      module: "settings",
      target: '.two-grid .card input[name="goal"]',
      title: "L’objectif du jour",
      body: "Votre objectif de chiffre d’affaires journalier, en centimes (150000 = 1 500 €). Le tableau de bord affiche votre progression.",
    },
    {
      module: "settings",
      target: ".two-grid .card .btn",
      text: "Enregistrer",
      title: "Enregistrer",
      body: "Les changements sont partagés avec toute l’équipe et le site public.",
      action: "Cliquez sur « Enregistrer » après vos modifications, ou passez.",
    },
    {
      module: "settings",
      target: ".two-grid .card:last-child",
      title: "Vos autres établissements",
      body: "Selon votre offre, vous pouvez ajouter d’autres restaurants. Chacun démarre vide, avec ses propres données.",
    },
  ],
  guide: {
    lead: "La fiche de l’établissement est la base de tout : son nom et son adresse alimentent le site, les tickets et les messages aux clients.",
    sections: [
      {
        title: "Pas à pas",
        steps: [
          "Configuration › Établissements.",
          "Vérifiez le nom, l’adresse et le téléphone.",
          "Fixez l’objectif journalier (en centimes : 150000 = 1 500 €).",
          "Cliquez sur « Enregistrer ».",
        ],
      },
      {
        title: "Aller plus loin",
        points: [
          "Mon site web : logo, histoire, photos et identité visuelle du site.",
          "Administration › Boutique et avis : horaires de commande et temps de préparation.",
          "Administration › Domaines : relier votre propre nom de domaine.",
        ],
      },
    ],
  },
};

export const invite: Chapter = {
  id: "invite",
  title: "Inviter votre équipe",
  icon: "UserPlus",
  permission: ["team"],
  starter: true,
  summary:
    "Créer un lien d’invitation, choisir les rôles et gérer les accès de chacun.",
  minutes: 2,
  steps: [
    {
      title: "Direction l’administration",
      body: "L’équipe se gère dans l’administration du restaurant. Cliquez sur « Suivant » : la visite vous y emmène et continue là-bas.",
    },
    {
      page: "admin:team",
      target: ".platform-admin-content section",
      text: "Inviter un collaborateur",
      title: "Inviter un collaborateur",
      body: "Une invitation par personne, pour ce restaurant. Elle n’engage aucun frais pour le collaborateur.",
    },
    {
      page: "admin:team",
      target: '.platform-admin-content input[type="email"]',
      title: "Son adresse e-mail",
      body: "L’adresse avec laquelle il créera son compte. Elle doit correspondre exactement : c’est ce qui protège l’accès.",
    },
    {
      page: "admin:team",
      target: ".admin-role-options",
      title: "Ses rôles",
      body: "Cochez un ou plusieurs rôles : Salle, Cuisine, Bar, Stocks, Achats, Comptabilité, Manager… Chaque rôle ouvre uniquement les écrans utiles à son métier.",
    },
    {
      page: "admin:team",
      target: ".platform-admin-content button",
      text: "Créer le lien d’invitation",
      title: "Créer le lien",
      body: "Le lien s’affiche juste en dessous : envoyez-le par message ou par e-mail. Il expire après sept jours et ne sert qu’une fois.",
    },
    {
      page: "admin:team",
      target: ".platform-admin-content section",
      text: "Équipe et accès",
      title: "Équipe et accès",
      body: "Retrouvez chaque membre, modifiez ses rôles ou retirez-lui l’accès. C’est aussi ici que vous décidez qui peut modifier le plan de salle.",
    },
    {
      page: "admin:team",
      title: "Retour au poste",
      body: "Votre équipe est en route. Cliquez sur « Suivant » : on retourne au poste pour planifier ses services.",
    },
    {
      module: "team",
      target: ".section-heading .btn",
      text: "Planifier",
      title: "Planifier les services",
      body: "Dans Équipe & planning, placez chaque équipier sur ses créneaux. Un chevauchement est détecté et refusé.",
    },
  ],
  guide: {
    lead: "Vos collaborateurs rejoignent votre restaurant sur invitation. Vous choisissez leurs rôles ; ils ne voient que ce dont ils ont besoin.",
    sections: [
      {
        title: "Inviter un collaborateur",
        steps: [
          "Ouvrez l’administration du restaurant (clic sur votre profil) › Équipe.",
          "Saisissez l’adresse e-mail du collaborateur.",
          "Cochez ses rôles dans cet établissement.",
          "Cliquez sur « Créer le lien d’invitation » et transmettez le lien.",
          "Le collaborateur crée son compte avec cette adresse et accepte l’invitation.",
        ],
      },
      {
        title: "Gérer les accès",
        points: [
          "Un même collaborateur peut cumuler plusieurs rôles.",
          "Le lien expire après sept jours et ne fonctionne qu’une fois.",
          "Vous pouvez modifier les rôles ou retirer l’accès à tout moment.",
          "Le droit de modifier le plan de salle se donne membre par membre.",
        ],
      },
    ],
  },
};

export const ingredients: Chapter = {
  id: "ingredients",
  title: "Créer vos ingrédients",
  icon: "Carrot",
  permission: ["stock"],
  starter: true,
  summary:
    "La base de votre carte : chaque ingrédient, son unité, puis son stock.",
  minutes: 2,
  steps: [
    {
      title: "D’abord les ingrédients, ensuite les plats",
      body: "Un plat est une recette : des ingrédients et leurs quantités. On crée donc d’abord les ingrédients (semoule, poulet, menthe…), puis les plats de la carte. La visite vous emmène dans l’administration, onglet Stocks et achats.",
    },
    {
      page: "admin:inventory",
      target: ".platform-admin-content section",
      text: "Créer un ingrédient",
      title: "Créer un ingrédient",
      body: "Un ingrédient = un nom et une unité de stock.",
    },
    {
      page: "admin:inventory",
      target: ".platform-admin-content section select",
      title: "Choisir la bonne unité",
      body: "Grammes pour ce qui se pèse (farine, viande), millilitres pour les liquides, unités pour ce qui se compte (œufs, merguez). Toutes les recettes utiliseront cette unité.",
    },
    {
      page: "admin:inventory",
      target: ".platform-admin-content section button",
      text: "Créer",
      title: "Créer",
      body: "Répétez l’opération pour chaque ingrédient de votre carte. Le stock démarre à zéro : il se remplit à la réception des livraisons ou par un inventaire.",
      action: "Saisissez un nom puis cliquez sur « Créer », ou passez.",
    },
    {
      page: "admin:inventory",
      target: ".platform-admin-content section",
      text: "Campagne d’inventaire",
      title: "Votre stock de départ",
      body: "Une campagne d’inventaire permet de saisir d’un coup ce que vous avez déjà en réserve. Les commandes fournisseurs multilignes, juste en dessous, servent à vos prochains achats.",
    },
    {
      module: "stocks",
      target: ".card.table-scroll",
      title: "Le suivi du stock",
      body: "De retour au poste : chaque ingrédient affiche son stock physique, réservé et disponible. Prochaine étape : créer vos plats avec leurs recettes.",
    },
  ],
  guide: {
    lead: "Les ingrédients sont le socle de la carte et des stocks. Une fois créés, ils servent dans les recettes, les livraisons et les inventaires.",
    sections: [
      {
        title: "Pas à pas",
        steps: [
          "Administration du restaurant › Stocks et achats › « Créer un ingrédient ».",
          "Saisissez le nom de l’ingrédient.",
          "Choisissez son unité : grammes, millilitres ou unités.",
          "Cliquez sur « Créer » ; recommencez pour chaque ingrédient.",
          "Saisissez votre stock de départ avec une campagne d’inventaire, ou réceptionnez une livraison.",
        ],
      },
      {
        title: "Bien choisir l’unité",
        points: [
          "Grammes : ce qui se pèse (semoule, viande, légumes).",
          "Millilitres : les liquides (huile, sirops, lait).",
          "Unités : ce qui se compte (œufs, merguez, citrons).",
          "Les quantités des recettes utilisent toujours l’unité de l’ingrédient.",
        ],
      },
    ],
    tip: "Commencez par les ingrédients de vos cinq plats les plus vendus : vous pourrez ouvrir le service tout de suite et compléter ensuite.",
  },
};

export const tables: Chapter = {
  id: "tables",
  title: "Placer vos tables",
  icon: "Armchair",
  permission: ["floor"],
  starter: true,
  summary:
    "Créer vos zones, ajouter vos tables, les placer et les tourner comme dans votre salle.",
  minutes: 3,
  steps: [
    {
      module: "dining",
      target: ".view-tabs button",
      text: "Aménager la salle",
      title: "Le mode architecte",
      body: "Le plan de salle a deux vues : Service, pour travailler, et Aménager la salle, pour dessiner votre établissement : zones, tables, places et orientation.",
      action: "Cliquez sur « Aménager la salle ».",
      autoClick: true,
      fallback:
        "L’aménagement est réservé aux membres à qui le propriétaire a donné le droit de modifier le plan.",
    },
    {
      target: ".zone-switch",
      title: "Vos zones",
      body: "Salle principale, terrasse, étage, bar… Chaque zone a son propre plan. « + Zone » en crée une nouvelle ; les flèches les réordonnent, « Renommer » et « Supprimer » sont juste à côté.",
      fallback: "Ouvrez d’abord l’onglet « Aménager la salle ».",
    },
    {
      target: ".section-heading .btn",
      text: "Ajouter une table",
      title: "Ajouter une table",
      body: "Numéro, nombre de places, forme (carrée, ronde, rectangulaire), nom facultatif, et si elle est proposée à la réservation en ligne.",
    },
    {
      target: ".floor-quota",
      title: "Votre plafond de tables",
      body: "Le nombre de tables actives, toutes zones confondues, et le plafond de votre offre. Une table archivée ne compte plus.",
    },
    {
      target: ".floor-map.editing",
      title: "Placez et tournez",
      body: "Glissez une table pour la placer. Tirez sa poignée ronde pour la tourner par pas de 15° (Maj pour un réglage au degré près). Au clavier : flèches pour déplacer, R pour tourner, Entrée pour modifier.",
    },
    {
      target: ".floor-tables",
      title: "La liste des tables",
      body: "Toutes les tables de la zone, pour modifier les places, l’état ou archiver. Le plan que vous dessinez est celui que vos clients voient en réservant.",
    },
  ],
  guide: {
    lead: "Le mode architecte reproduit votre établissement : zones, tables, places et orientation. Le même plan sert au service et à la réservation en ligne.",
    sections: [
      {
        title: "Pas à pas",
        steps: [
          "Plan de salle › onglet « Aménager la salle ».",
          "Créez vos zones avec « + Zone » (salle, terrasse, étage…).",
          "Dans chaque zone, « Ajouter une table » : numéro, places, forme.",
          "Glissez les tables à leur place et tournez-les avec la poignée ronde.",
          "Choisissez quelles tables sont proposées à la réservation en ligne.",
        ],
      },
      {
        title: "Règles",
        points: [
          "Le plafond de tables actives dépend de votre offre, toutes zones confondues.",
          "Le propriétaire décide, membre par membre, qui peut modifier le plan.",
          "Une table occupée ne peut pas être archivée ; une table avec historique ne peut qu’être archivée.",
          "Une zone qui contient des tables avec historique ne peut pas être supprimée.",
        ],
      },
    ],
  },
};

export const seo: Chapter = {
  id: "seo",
  title: "SEO et visibilité IA",
  icon: "Search",
  permission: ["website"],
  summary:
    "Lancer une analyse de votre site, lire les recommandations et suivre votre visibilité.",
  minutes: 2,
  steps: [
    {
      title: "Être trouvé sur Google et par les IA",
      body: "Le SEO, c’est ce qui fait apparaître votre restaurant quand quelqu’un cherche « couscous Bernay » sur Google ou demande conseil à un assistant IA. STUDIO OS analyse votre site et vous dit quoi améliorer. La visite vous emmène dans l’administration, onglet SEO.",
    },
    {
      page: "admin:seo",
      target: ".platform button",
      text: "Lancer l’analyse",
      title: "Lancer une analyse",
      body: "L’analyse contrôle votre site public : titres, descriptions, images, horaires, adresse, plan du site, lisibilité par les moteurs et les assistants IA. Elle prend quelques secondes.",
      action: "Cliquez sur « Lancer l’analyse maintenant ».",
      autoClick: true,
      fallback:
        "Le bouton « Lancer l’analyse maintenant » apparaît en haut de la page SEO.",
    },
    {
      page: "admin:seo",
      target: '[aria-labelledby="seo-summary"]',
      title: "Le résultat",
      body: "Le nombre de contrôles réussis, à surveiller et en échec, avec la date de l’analyse. Relancez-la après chaque modification de votre site.",
      fallback: "Le résultat s’affiche après la première analyse.",
    },
    {
      page: "admin:seo",
      target: '[aria-labelledby="seo-todo"]',
      title: "Les recommandations",
      body: "Ce qu’il reste à faire, de la plus importante à la moins urgente, expliqué en langage simple. Les points résolus depuis l’analyse précédente sont signalés.",
    },
    {
      page: "admin:seo",
      target: '[aria-labelledby="seo-organic"]',
      title: "Visibilité organique",
      body: "Votre présence dans les moteurs de recherche classiques.",
    },
    {
      page: "admin:seo",
      target: '[aria-labelledby="seo-ai"]',
      title: "Visibilité IA",
      body: "Ce que les assistants IA disent de vous. Notez vos observations pour suivre leur évolution dans le temps.",
    },
    {
      page: "admin:seo",
      target: '[aria-labelledby="seo-history"]',
      title: "L’historique",
      body: "Toutes vos analyses, pour mesurer vos progrès semaine après semaine.",
    },
  ],
  guide: {
    lead: "Le module SEO et visibilité IA analyse votre site public et vous guide, en langage simple, pour être mieux trouvé sur les moteurs de recherche et par les assistants IA.",
    sections: [
      {
        title: "Lancer une analyse",
        steps: [
          "Administration du restaurant › SEO et visibilité IA.",
          "Cliquez sur « Lancer l’analyse maintenant ».",
          "Lisez la dernière analyse : contrôles réussis, à surveiller, en échec.",
          "Traitez les recommandations, de la plus importante à la moins urgente.",
          "Relancez l’analyse pour vérifier vos corrections.",
        ],
      },
      {
        title: "Comprendre les résultats",
        points: [
          "Visibilité organique : votre présence dans les moteurs de recherche.",
          "Visibilité IA : ce que les assistants IA disent de votre restaurant.",
          "Historique : l’évolution de vos analyses dans le temps.",
          "Le titre, la description et l’image de partage se règlent dans Mon site web, partie identité et référencement.",
        ],
      },
    ],
    tip: "Les gains les plus rapides : une description qui cite votre ville et votre cuisine, des horaires à jour et des photos décrites.",
  },
};

export const offline: Chapter = {
  id: "offline",
  title: "Travailler hors ligne",
  icon: "WifiOff",
  permission: ["orders"],
  summary:
    "Préparer un appareil, continuer le service pendant une coupure et tout resynchroniser.",
  minutes: 2,
  steps: [
    {
      title: "Une coupure ne doit pas arrêter le service",
      body: "Si Internet tombe en plein service, un appareil préparé à l’avance continue de prendre les commandes. La visite vous emmène dans l’administration pour vous montrer où tout se trouve.",
    },
    {
      page: "admin:shop",
      target: '[data-tour="admin-offline"]',
      title: "Le mode hors ligne",
      body: "Ce lien ouvre le poste de service hors ligne sur l’appareil que vous utilisez (tablette, téléphone, ordinateur de la salle).",
    },
    {
      page: "admin:shop",
      title: "1. Préparer l’appareil, avant la coupure",
      body: "Tant que le réseau fonctionne : donnez un nom au poste et enregistrez l’appareil. Il réserve un quota de stock pour les produits qu’il pourra vendre seul.",
    },
    {
      page: "admin:shop",
      title: "2. Pendant la coupure",
      body: "Prenez les commandes normalement sur cet appareil. Les tickets restent enregistrés dessus. Attention : un appareil ne transmet pas ses tickets aux autres pendant la coupure.",
    },
    {
      page: "admin:shop",
      title: "3. Au retour du réseau",
      body: "Cliquez sur « Synchroniser » : les opérations sont envoyées et appliquées. Si une opération ne colle plus (stock épuisé entre-temps…), elle devient un conflit à vérifier.",
    },
    {
      page: "admin:reconciliation",
      target: ".platform-admin-content section",
      text: "Conflits hors ligne",
      title: "Les conflits à vérifier",
      body: "Chaque conflit montre le ticket local et le stock : vous acceptez ou rejetez, avec un motif. Un rejet n’applique rien et garde la trace.",
    },
    {
      page: "admin:shop",
      title: "4. Retirer un appareil",
      body: "Avant de retirer un appareil, synchronisez-le et réglez ses conflits : un navigateur effacé perd ses opérations non synchronisées.",
      link: {
        label: "Ouvrir le poste hors ligne",
        href: "/offline?restaurant={restaurant}",
      },
    },
  ],
  guide: {
    lead: "Le poste de service hors ligne permet de continuer à prendre des commandes pendant une coupure de réseau. Chaque appareil fonctionne de façon indépendante, puis se resynchronise.",
    sections: [
      {
        title: "Pas à pas",
        steps: [
          "Avant toute coupure : Administration › Mode hors ligne, nommez le poste et enregistrez l’appareil.",
          "L’appareil réserve un quota de stock pour vendre seul.",
          "Pendant la coupure : prenez les commandes sur cet appareil.",
          "Au retour du réseau : « Synchroniser ».",
          "Réglez les conflits éventuels dans Administration › Conflits hors ligne.",
          "Avant de retirer l’appareil : synchronisez-le et videz ses conflits.",
        ],
      },
      {
        title: "Limites à connaître",
        points: [
          "Aucun transfert automatique de ticket entre appareils pendant la coupure.",
          "Un navigateur dont les données sont effacées perd ses opérations non synchronisées.",
          "Les quotas de stock évitent de vendre plus que ce qui est réellement disponible.",
        ],
      },
    ],
  },
};
