/* Contenu unique du tutoriel : la visite interactive du poste de travail
   (components/tutorial) et la page /guide lisent les mêmes parcours, pour que
   les deux disent toujours la même chose. */
import {
  can,
  roleLabels,
  roles,
  type Permission,
  type Role,
} from "@/lib/permissions";

export type TourStep = {
  /** Module du poste de travail à ouvrir avant l’étape (le premier autorisé si plusieurs). */
  module?: string | string[];
  /** Sélecteur CSS de l’élément à mettre en lumière ; absent : bulle centrée. */
  target?: string;
  /** Ne garde que l’élément dont le texte contient cette chaîne. */
  text?: string;
  title: string;
  body: string;
  /** Consigne interactive : un clic sur l’élément fait passer à l’étape suivante. */
  action?: string;
  /** Le bouton « Le faire pour moi » peut cliquer l’élément (actions sans effet sur les données). */
  autoClick?: boolean;
  /** Ferme la fenêtre ouverte avant d’afficher l’étape. */
  closeModal?: boolean;
  /** Texte affiché si l’élément n’est pas à l’écran (aucune commande, liste vide…). */
  fallback?: string;
  /** Lien proposé dans la bulle ; {restaurant} est remplacé par l’établissement courant. */
  link?: { label: string; href: string };
};

export type GuideSection = {
  title: string;
  text?: string;
  steps?: string[];
  points?: string[];
};

export type Chapter = {
  id: string;
  title: string;
  /** Nom d’icône lucide, résolu par les composants. */
  icon: string;
  /** Au moins une de ces permissions ; null : tous les profils. */
  permission: Permission[] | null;
  summary: string;
  minutes: number;
  steps: TourStep[];
  guide: { lead: string; sections: GuideSection[]; tip?: string };
};

export const chapters: Chapter[] = [
  {
    id: "start",
    title: "Premiers pas dans le poste de travail",
    icon: "Compass",
    permission: null,
    summary:
      "Repérer l’établissement, le menu, la synchronisation, les notifications et votre profil.",
    minutes: 2,
    steps: [
      {
        title: "Bienvenue dans atacuisine",
        body: "Un seul outil pour la salle, la cuisine, le bar, les stocks et la direction. Ce que l’un saisit est immédiatement visible par les autres. Cette visite vous montre où tout se trouve ; vous pouvez la quitter à tout moment avec Échap.",
      },
      {
        target: '[data-tour="restaurant-switch"]',
        title: "Votre établissement",
        body: "Toutes les données affichées (carte, commandes, stocks, équipe) appartiennent à l’établissement choisi ici. Votre organisation peut regrouper plusieurs établissements, chacun avec ses propres données.",
      },
      {
        target: '[data-tour="nav"]',
        title: "Le menu, adapté à votre métier",
        body: "Les modules sont rangés par familles : Pilotage, Opérations, Gestion, Équipe, Finances, Relation client et Configuration. Vous ne voyez que ceux que votre rôle autorise : un cuisinier n’a pas accès aux finances, un comptable ne prend pas de commandes.",
      },
      {
        target: '[data-tour="live"]',
        title: "Synchronisation en direct",
        body: "Le poste se met à jour automatiquement toutes les 5 secondes environ. Inutile de recharger la page : une commande envoyée par la salle apparaît d’elle-même en cuisine.",
      },
      {
        target: '[data-tour="notifications"]',
        title: "Notifications",
        body: "Une pastille signale les nouveautés : commande prête, réservation reçue, livraison… « Tout marquer comme lu » vide la liste pour votre seul profil.",
      },
      {
        target: '[data-tour="banner"]',
        title: "Espace de démonstration",
        body: "En démonstration, les données sont fictives et aucun paiement réel n’a lieu. « Changer de profil » permet d’endosser un autre métier (salle, cuisine, stocks…) pour voir le même service sous un autre angle.",
      },
      {
        target: '[data-tour="public-link"]',
        title: "Votre site public",
        body: "Chaque établissement a son site : carte, commande en ligne, réservation et espace client. Il lit les mêmes données que ce poste : un produit archivé ici disparaît du site.",
      },
      {
        target: '[data-tour="profile"]',
        title: "Votre profil et l’administration",
        body: "Votre nom et votre rôle. Un clic ouvre l’administration du restaurant : équipe et invitations, boutique, fidélité, domaines, achats et journal.",
      },
      {
        target: '[data-tour="guide-button"]',
        title: "Le guide, toujours à portée",
        body: "Rouvrez ce centre d’apprentissage quand vous voulez : chaque parcours se relance en un clic et votre progression est mémorisée sur cet appareil.",
        link: { label: "Lire le guide complet", href: "/guide" },
      },
    ],
    guide: {
      lead: "Le poste de travail (/dashboard) est l’écran commun de toute l’équipe. Il se compose d’une barre latérale, d’une barre supérieure et d’une zone de travail qui affiche le module choisi.",
      sections: [
        {
          title: "Se repérer",
          points: [
            "Sélecteur d’établissement : toutes les données affichées appartiennent à l’établissement choisi.",
            "Menu par familles : Pilotage, Opérations, Gestion, Équipe, Pilotage financier, Relation client, Configuration.",
            "Barre supérieure : fil d’Ariane, indicateur de synchronisation, date du jour et notifications.",
            "Bandeau : en démonstration, rappel des données fictives et lien pour changer de profil.",
            "Bas de la barre latérale : lien vers le site public et accès à votre profil / administration.",
          ],
        },
        {
          title: "Un écran par métier",
          text: "Chaque rôle voit uniquement les modules qu’il est autorisé à utiliser, et le serveur revérifie chaque action. À la connexion, un cuisinier arrive directement sur la Cuisine et un barman sur le Bar.",
        },
        {
          title: "Données partagées en temps réel",
          text: "Le poste interroge le serveur toutes les 5 secondes environ, et se rafraîchit complètement toutes les 30 secondes. Deux personnes sur deux appareils voient donc le même service, sans rechargement.",
        },
      ],
      tip: "En démonstration, ouvrez deux navigateurs différents (par exemple Salle et Cuisine) pour voir une commande voyager d’un poste à l’autre.",
    },
  },
  {
    id: "overview",
    title: "Lire le tableau de bord",
    icon: "LayoutDashboard",
    permission: ["finance"],
    summary:
      "Chiffre du jour, rythme des ventes, objectif journalier et produits phares.",
    minutes: 1,
    steps: [
      {
        module: "overview",
        target: ".welcome",
        title: "L’accueil du service",
        body: "Le point de départ de la direction : un résumé du jour et un accès direct au plan de salle pour lancer le service.",
      },
      {
        module: "overview",
        target: ".metrics",
        title: "Les indicateurs clés",
        body: "CA déclaré aujourd’hui, commandes en cours (et demandes à confirmer), tables occupées et préparations prêtes à servir.",
      },
      {
        module: "overview",
        target: ".chart-card",
        title: "Le rythme des ventes",
        body: "L’évolution des ventes dans le temps pour repérer les heures de pointe et les jours forts.",
      },
      {
        module: "overview",
        target: ".target-card",
        title: "L’objectif du jour",
        body: "La progression vers l’objectif journalier. Vous le réglez dans Configuration › Établissements.",
      },
    ],
    guide: {
      lead: "Vue d’ensemble est la page d’accueil des propriétaires et des profils financiers. Elle rassemble les chiffres du jour sans aucune saisie supplémentaire : tout vient des commandes et des règlements déclarés.",
      sections: [
        {
          title: "Ce que vous y trouvez",
          points: [
            "Indicateurs : CA déclaré aujourd’hui, commandes en cours et demandes à confirmer, tables occupées, préparations prêtes.",
            "Le rythme des ventes : graphique des ventes dans le temps.",
            "Objectif du jour : jauge de progression vers l’objectif fixé dans Établissements.",
            "À la une du service et les favoris de la maison : commandes en cours et produits les plus vendus.",
            "Dernières nouvelles : notifications récentes du restaurant.",
          ],
        },
      ],
    },
  },
  {
    id: "floor",
    title: "Le plan de salle",
    icon: "UtensilsCrossed",
    permission: ["orders"],
    summary:
      "Comprendre l’état des tables, les réservations à venir et l’aménagement de la salle.",
    minutes: 2,
    steps: [
      {
        module: "dining",
        target: ".legend",
        title: "Quatre états de table",
        body: "Libre (prête à accueillir), Occupée (une commande est ouverte), À nettoyer (le règlement vient d’être déclaré) et Indisponible (hors service). Les couleurs sont les mêmes partout.",
      },
      {
        module: "dining",
        target: ".table-grid",
        title: "Les tables, par zone",
        body: "Chaque carte indique le numéro, le nombre de places et l’état. Si une réservation arrive dans les 12 prochaines heures, l’heure et le nombre de personnes s’affichent.",
      },
      {
        module: "dining",
        target: ".view-tabs",
        title: "Aménager la salle",
        body: "Ajoutez, déplacez ou archivez des tables, choisissez leur zone, leur forme et leur capacité, et décidez si elles sont proposées à la réservation en ligne. Le plan vu par vos clients se met à jour aussitôt.",
        fallback:
          "L’aménagement de la salle est réservé aux profils Propriétaire, Manager, Salle et Bar.",
      },
      {
        module: "dining",
        target: ".order-grid",
        title: "Le service en cours",
        body: "Sous le plan, toutes les commandes ouvertes, avec l’état de chaque ligne : à préparer, en préparation, prête, servie.",
      },
    ],
    guide: {
      lead: "Le plan de salle est le cœur du service en salle : il montre toutes les tables de l’établissement et permet d’ouvrir une commande d’un simple clic.",
      sections: [
        {
          title: "Les états d’une table",
          points: [
            "Libre : la table peut accueillir des clients.",
            "Occupée : au moins une commande est ouverte sur la table.",
            "À nettoyer : le règlement a été déclaré ; un clic sur « Marquer libre » la remet en service.",
            "Indisponible : table hors service (ni commande ni réservation).",
          ],
        },
        {
          title: "Aménager la salle",
          steps: [
            "Plan de salle › onglet « Aménager la salle ».",
            "Ajoutez une table : numéro, nombre de places, zone, forme (carrée, ronde, rectangulaire), nom affiché facultatif.",
            "Choisissez « Réservation en ligne » : proposée aux clients ou masquée (réservée au personnel).",
            "Glissez la table sur le plan pour la placer.",
          ],
        },
        {
          title: "Règles de sécurité",
          points: [
            "Une table occupée ne peut ni changer d’état manuellement ni être archivée.",
            "Une table qui a un historique de commandes ne peut être qu’archivée, pas supprimée.",
            "Réduire le nombre de places est refusé si une réservation à venir dépasse la nouvelle capacité.",
          ],
        },
      ],
    },
  },
  {
    id: "order",
    title: "Prendre une commande",
    icon: "ClipboardList",
    permission: ["orders"],
    summary:
      "Ouvrir une table, composer la commande et l’envoyer en cuisine et au bar.",
    minutes: 3,
    steps: [
      {
        module: "dining",
        target: ".table-wrap.free .dining-table",
        title: "Ouvrez une table libre",
        body: "Une commande se prend toujours sur une table. Si la table est déjà occupée, la nouvelle commande rejoint la même session : une seule addition à la fin.",
        action: "Cliquez sur une table libre pour ouvrir la prise de commande.",
        autoClick: true,
        fallback:
          "Aucune table libre pour l’instant : marquez une table « À nettoyer » comme libre, ou ouvrez une table occupée.",
      },
      {
        target: ".modal .search",
        title: "Recherchez un produit",
        body: "Tapez quelques lettres pour retrouver un plat ou une boisson parmi toute la carte.",
        fallback:
          "Ouvrez d’abord une table pour afficher la prise de commande.",
      },
      {
        target: ".modal .tabs",
        title: "Parcourez par catégorie",
        body: "Entrées, Plats, Desserts, Boissons : la carte est rangée comme en salle.",
      },
      {
        target: ".modal .menu-row",
        title: "Ajoutez les quantités",
        body: "Les boutons + et − ajustent la quantité. Les portions disponibles sont calculées à partir du stock réel et des recettes : impossible de vendre un plat dont il manque les ingrédients.",
      },
      {
        target: ".modal label",
        text: "Instructions",
        title: "Précisez la préparation",
        body: "Une allergie, une cuisson, « à partager » : la note s’affiche sur le ticket de la cuisine ou du bar.",
      },
      {
        target: ".modal .btn.primary",
        text: "Envoyer",
        title: "Envoyez en préparation",
        body: "Les plats partent sur l’écran Cuisine, les boissons sur l’écran Bar, chacun à son rythme. Les ingrédients sont réservés tout de suite et consommés au moment où la préparation commence. La table passe Occupée.",
        action:
          "Ajoutez au moins un produit puis cliquez pour envoyer (en démonstration, la commande est réellement créée), ou passez à la suite.",
      },
      {
        closeModal: true,
        module: "dining",
        target: ".order-grid",
        title: "La commande est en cours",
        body: "Elle apparaît dans « Le service en cours » et dans Commandes, avec l’état de chaque ligne. Pour ajouter des desserts plus tard, rouvrez simplement la même table.",
      },
    ],
    guide: {
      lead: "Prendre une commande se fait en quelques secondes depuis le plan de salle, sur tablette, téléphone ou ordinateur. Cuisiniers et barmen peuvent aussi prendre une commande depuis leur écran (bouton « Nouvelle commande »).",
      sections: [
        {
          title: "Pas à pas",
          steps: [
            "Plan de salle › cliquez sur une table libre (ou occupée pour compléter une commande).",
            "Recherchez un produit ou parcourez Entrées, Plats, Desserts, Boissons.",
            "Ajustez les quantités avec + et − ; le nombre de portions disponibles s’affiche sous chaque produit.",
            "Ajoutez si besoin des instructions de préparation.",
            "Cliquez sur « Envoyer en préparation » : le total est rappelé sur le bouton.",
          ],
        },
        {
          title: "Ce qui se passe ensuite",
          points: [
            "Les lignes « cuisine » apparaissent sur l’écran Cuisine, les lignes « bar » sur l’écran Bar.",
            "Les ingrédients de la recette sont réservés : le stock disponible baisse, le stock physique pas encore.",
            "La table passe à l’état Occupée et la commande est attribuée au profil qui l’a prise.",
            "Le prix est figé dans la commande : modifier la carte ensuite ne change pas les commandes passées.",
          ],
        },
        {
          title: "Plusieurs commandes sur une table",
          text: "Chaque nouvelle commande sur une table occupée rejoint la même session de table. Les commandes gardent leur identité (pratique pour la cuisine), mais le règlement est déclaré une seule fois pour toute la table.",
        },
      ],
      tip: "Un double clic accidentel ne crée pas deux commandes : chaque envoi porte une clé unique et le serveur ignore les doublons.",
    },
  },
  {
    id: "kitchen",
    title: "Cuisine et bar : préparer",
    icon: "ChefHat",
    permission: ["kitchen", "bar"],
    summary:
      "Les écrans de préparation : commencer, marquer prêt et suivre les tickets.",
    minutes: 2,
    steps: [
      {
        module: ["kitchen", "bar"],
        target: ".kds-grid",
        title: "Les tickets de préparation",
        body: "Un ticket par table, avec le temps écoulé depuis la commande. Seuls les produits de votre poste s’affichent : les plats en cuisine, les boissons au bar.",
      },
      {
        module: ["kitchen", "bar"],
        target: ".prep-item .btn",
        text: "Commencer",
        title: "Commencer une préparation",
        body: "« Commencer » passe la ligne En préparation et consomme réellement les ingrédients réservés. C’est le moment où le stock physique diminue.",
        fallback:
          "Aucun produit à préparer pour l’instant : prenez une commande depuis le plan de salle, elle arrivera ici en quelques secondes.",
      },
      {
        module: ["kitchen", "bar"],
        target: ".prep-item .btn",
        text: "Marquer prêt",
        title: "Marquer prêt",
        body: "Quand le plat ou la boisson est prêt, la salle le voit immédiatement et peut le servir.",
        fallback:
          "Ce bouton apparaît sur une ligne une fois sa préparation commencée.",
      },
      {
        module: ["kitchen", "bar"],
        target: "label.check",
        title: "Historique du service",
        body: "Cochez « Voir les produits servis » pour retrouver ce qui est déjà parti.",
      },
      {
        module: ["kitchen", "bar"],
        target: ".actions .btn",
        text: "Nouvelle commande",
        title: "Prendre une commande depuis la cuisine",
        body: "En renfort, cuisine et bar peuvent prendre une commande pour une table. Elle est attribuée à votre profil ; le règlement reste réservé aux profils habilités.",
      },
    ],
    guide: {
      lead: "Les écrans Cuisine et Bar remplacent les bons papier. Chaque poste reçoit uniquement ses produits et avance à son propre rythme : les boissons peuvent partir avant les plats.",
      sections: [
        {
          title: "Le cycle d’une ligne",
          steps: [
            "À préparer : la ligne vient d’arriver, ses ingrédients sont réservés.",
            "Commencer : la ligne passe En préparation et les ingrédients sont consommés dans le stock.",
            "Marquer prêt : la salle est prévenue et peut servir.",
            "Servi : la salle a remis le produit au client.",
          ],
        },
        {
          title: "Annulations",
          points: [
            "Avant « Commencer » : l’annulation libère les ingrédients réservés, rien n’est perdu.",
            "Après « Commencer » : les ingrédients déjà consommés sont enregistrés en perte, avec le motif.",
            "Une ligne servie ne peut plus être annulée par cette action.",
          ],
        },
      ],
      tip: "Les écrans fonctionnent très bien sur une tablette fixée au passe : la synchronisation est automatique.",
    },
  },
  {
    id: "payment",
    title: "Servir et déclarer le règlement",
    icon: "Wallet",
    permission: ["payments"],
    summary:
      "Servir les lignes, clôturer l’addition, appliquer un code promo et libérer la table.",
    minutes: 3,
    steps: [
      {
        module: "orders",
        target: 'select[aria-label="Filtrer les commandes"]',
        title: "Suivi des commandes",
        body: "Filtrez les commandes : En cours, À confirmer (reçues du site ou du QR code de table), Réglées ou Toutes.",
      },
      {
        module: "orders",
        target: ".order-card .item-actions",
        title: "Servir ou annuler une ligne",
        body: "Dès qu’une ligne est prête, « Servir » la marque comme remise au client. « Annuler » retire une ligne non servie ; si sa préparation avait commencé, les ingrédients sont comptés en perte.",
        fallback:
          "Aucune commande en cours : prenez-en une depuis le plan de salle pour suivre ce parcours en conditions réelles.",
      },
      {
        module: "orders",
        target: ".order-card .btn",
        text: "Clôturer",
        title: "Clôturer l’addition",
        body: "Quand le client paie, ouvrez la déclaration de règlement. Elle clôture toutes les commandes de la table en une fois.",
        action: "Cliquez sur « Clôturer / déclarer le règlement ».",
        autoClick: true,
        fallback:
          "Le bouton apparaît sur chaque commande en cours, pour les profils autorisés à encaisser.",
      },
      {
        target: '.modal select[name="customer"]',
        title: "Le client (facultatif)",
        body: "Associez l’addition à un client de votre fichier pour lui attribuer l’achat. C’est obligatoire uniquement s’il utilise un code personnel.",
        fallback:
          "Ouvrez la déclaration de règlement d’une commande pour voir ce formulaire.",
      },
      {
        target: '.modal input[name="promo"]',
        title: "Le code promo personnel",
        body: "Saisissez le code fourni par le client. La remise (pourcentage ou montant fixe) s’applique à toute l’addition de la table ; un seul code par addition, à usage unique.",
      },
      {
        target: '.modal select[name="method"]',
        title: "Le moyen de paiement",
        body: "Carte bancaire, espèces ou autre. atacuisine enregistre le règlement que vous avez encaissé avec votre terminal habituel : il n’encaisse pas lui-même l’argent.",
      },
      {
        target: ".modal .btn.primary",
        title: "Confirmer",
        body: "Le montant net (après remise) alimente le chiffre d’affaires et les rapports. La table passe À nettoyer.",
      },
      {
        closeModal: true,
        module: "dining",
        target: ".table-grid",
        title: "Remettre la table en service",
        body: "Une fois la table débarrassée, « Marquer libre » sur sa carte la rend disponible pour les clients suivants.",
      },
    ],
    guide: {
      lead: "Le règlement se déclare à la fin du repas, une fois par table. atacuisine n’est pas une caisse certifiée : il enregistre le paiement encaissé avec votre terminal ou en espèces, pour que les ventes, les stocks et la fidélité restent justes.",
      sections: [
        {
          title: "Pas à pas",
          steps: [
            "Commandes (ou Plan de salle) › servez chaque ligne prête avec « Servir ».",
            "Cliquez sur « Clôturer / déclarer le règlement » sur une commande de la table.",
            "Facultatif : choisissez le client titulaire et saisissez son code promo personnel.",
            "Choisissez le moyen de paiement déclaré : carte bancaire, espèces ou autre.",
            "Confirmez : toutes les commandes de la table passent Réglées et la table À nettoyer.",
            "Plan de salle › « Marquer libre » quand la table est prête.",
          ],
        },
        {
          title: "Les commandes à confirmer",
          text: "Les commandes reçues depuis le site public ou le QR code de table arrivent avec l’état « À confirmer ». Un profil de salle les accepte (elles partent en préparation) ou les refuse.",
        },
        {
          title: "Qui peut encaisser ?",
          points: [
            "Propriétaire, Manager et Salle déclarent les règlements.",
            "Cuisine et Bar peuvent servir et annuler, mais pas encaisser.",
            "Les profils de salle ne voient que le nom des clients, jamais leurs fiches privées.",
          ],
        },
      ],
      tip: "Exemple : 2 couscous à 22 € et 2 thés à 3,50 € donnent un règlement déclaré de 51 €.",
    },
  },
  {
    id: "reservations",
    title: "Gérer les réservations",
    icon: "CalendarDays",
    permission: ["reservations"],
    summary:
      "Recevoir les demandes du site, confirmer, affecter une table et suivre l’arrivée.",
    minutes: 2,
    steps: [
      {
        module: "reservations",
        target: ".section-heading a",
        title: "Le formulaire public",
        body: "Vos clients réservent depuis votre site : nombre de convives, jour sur le calendrier, heure, puis table libre sur le plan. Ouvrez-le pour essayer.",
      },
      {
        module: "reservations",
        target: ".card.table-scroll",
        title: "Les prochaines tablées",
        body: "Toutes les demandes, avec le client, le créneau, le nombre de couverts, la table et le statut. Une demande reste provisoire tant que vous ne l’avez pas confirmée.",
      },
      {
        module: "reservations",
        target: ".card.table-scroll .btn",
        text: "Gérer",
        title: "Confirmer et affecter une table",
        body: "« Gérer » permet de confirmer ou refuser une demande, d’affecter une table, puis de noter l’arrivée ou l’absence. atacuisine refuse une table trop petite ou déjà réservée sur le même créneau.",
        fallback:
          "Aucune réservation à gérer : créez-en une depuis le formulaire public.",
      },
    ],
    guide: {
      lead: "Les réservations arrivent du site public ou sont saisies par l’équipe. Elles apparaissent sur le plan de salle quand elles approchent.",
      sections: [
        {
          title: "Le cycle d’une réservation",
          steps: [
            "Demandée : le client a envoyé sa demande depuis le site.",
            "Confirmée : l’équipe accepte et affecte une table.",
            "Arrivé : les clients sont installés ; ou Absent s’ils ne viennent pas.",
            "Refusée ou Annulée : la demande est close.",
          ],
        },
        {
          title: "Contrôles automatiques",
          points: [
            "Capacité : une table trop petite pour le nombre de convives est refusée.",
            "Chevauchement : une même table ne peut pas être confirmée deux fois sur le même créneau.",
            "Les confirmations ne sont jamais publiques ; aucun message externe n’est envoyé en démonstration.",
          ],
        },
      ],
    },
  },
  {
    id: "menu",
    title: "Créer un produit sur la carte",
    icon: "BookOpen",
    permission: ["catalog"],
    summary:
      "Ajouter un plat avec son prix, son poste de préparation et sa recette, puis l’archiver ou le restaurer.",
    minutes: 3,
    steps: [
      {
        module: "menu",
        target: ".section-heading .btn",
        text: "Ajouter un produit",
        title: "Ajouter un produit",
        body: "Un produit créé ici est aussitôt commandable en salle et visible sur le site.",
        action: "Cliquez sur « Ajouter un produit ».",
        autoClick: true,
      },
      {
        target: ".modal .recipe-line",
        title: "La recette, par portion",
        body: "Indiquez chaque ingrédient et sa quantité pour une portion, dans l’unité du stock (grammes, pièces…). C’est grâce à elle que atacuisine réserve et consomme le bon stock, et calcule les portions disponibles.",
        fallback: "Ouvrez « Ajouter un produit » pour voir le formulaire.",
      },
      {
        target: ".modal .btn.secondary",
        text: "Ajouter un ingrédient",
        title: "Plusieurs ingrédients",
        body: "Ajoutez autant de lignes que nécessaire ; la croix retire une ligne.",
      },
      {
        target: ".modal .form",
        title: "Les informations du produit",
        body: "Nom, prix de vente, catégorie (Entrées, Plats, Desserts, Boissons), préparation (Cuisine ou Bar : c’est l’écran qui recevra le ticket), description et disponibilité à la vente.",
      },
      {
        target: ".modal .btn.primary",
        text: "Créer le produit",
        title: "Créer le produit",
        body: "Le produit rejoint la carte active.",
      },
      {
        closeModal: true,
        module: "menu",
        target: ".tabs",
        title: "Produits actifs et archives",
        body: "Archiver retire un produit des commandes et du site sans perdre son historique ; « Archives » permet de le restaurer.",
      },
      {
        module: "menu",
        target: ".recipe-card",
        title: "Chaque fiche produit",
        body: "Modifiez le prix, la description ou la recette, archivez ou supprimez. La suppression n’est possible que si le produit n’a jamais été commandé.",
      },
    ],
    guide: {
      lead: "La carte est partagée par la salle, la cuisine, le bar, les stocks et le site public. Chaque produit est relié à une recette : c’est ce qui permet de suivre le stock au gramme près.",
      sections: [
        {
          title: "Créer un produit",
          steps: [
            "Configuration › La carte › « Ajouter un produit ».",
            "Composez la recette : un ingrédient et une quantité par portion pour chaque ligne.",
            "Renseignez le nom, le prix de vente, la catégorie et la préparation (Cuisine ou Bar).",
            "Ajoutez une description et choisissez s’il est disponible à la vente.",
            "Cliquez sur « Créer le produit ».",
          ],
        },
        {
          title: "Faire vivre la carte",
          points: [
            "Modifier : prix, description et recette ; les commandes passées gardent leur prix d’origine.",
            "Archiver : le produit disparaît des commandes et du site, l’historique est conservé.",
            "Restaurer : depuis l’onglet Archives.",
            "Supprimer : seulement pour un produit jamais commandé.",
          ],
        },
      ],
      tip: "Les options, photos et descriptions détaillées du site se règlent dans Mon site web et dans l’administration de la boutique.",
    },
  },
  {
    id: "stocks",
    title: "Stocks, lots et inventaire",
    icon: "Package",
    permission: ["stock"],
    summary:
      "Physique, réservé et disponible ; lots avec date limite, pertes, inventaire et recettes.",
    minutes: 3,
    steps: [
      {
        module: "stocks",
        target: ".card.table-scroll",
        title: "Trois chiffres par ingrédient",
        body: "Physique : ce qui est réellement en réserve. Réservé : ce que les commandes en attente vont utiliser. Disponible : physique moins réservé, hors lots expirés. « À surveiller » signale un seuil bas.",
      },
      {
        module: "stocks",
        target: ".card.table-scroll .btn",
        text: "Perte",
        title: "Les lots",
        body: "Chaque livraison crée un lot avec sa date limite. « Perte » enregistre un produit jeté avec son motif ; « Inventaire » corrige la quantité réellement comptée.",
      },
      {
        module: "stocks",
        target: ".module-search",
        title: "Filtrer",
        body: "Retrouvez un ingrédient, un lot ou un mouvement en tapant son nom.",
      },
      {
        module: "stocks",
        target: '[data-tour="nav-recipes"]',
        title: "Les recettes",
        body: "Le module Recettes montre la fiche technique de chaque produit : les ingrédients et quantités utilisés par portion.",
      },
    ],
    guide: {
      lead: "Le stock est calculé automatiquement à partir des recettes, des commandes et des livraisons. Vous n’intervenez que pour les pertes et les inventaires.",
      sections: [
        {
          title: "Le cycle du stock",
          steps: [
            "Réception d’une livraison : un lot est créé avec sa quantité et sa date limite.",
            "Commande envoyée : les ingrédients sont réservés, le disponible baisse.",
            "Préparation commencée : les ingrédients sont consommés, le physique baisse.",
            "Annulation avant préparation : la réservation est libérée.",
            "Annulation après préparation : la quantité consommée est enregistrée en perte.",
          ],
        },
        {
          title: "Pertes et inventaires",
          points: [
            "Perte : quantité perdue et motif, sur un lot précis.",
            "Inventaire : quantité réellement comptée et motif de correction (Propriétaire, Manager, Stocks).",
            "Un comptage inférieur à la quantité déjà réservée est refusé.",
            "Les lots expirés sont exclus du disponible.",
            "Tous les mouvements sont historisés dans « Mouvements récents ».",
          ],
        },
      ],
    },
  },
  {
    id: "purchases",
    title: "Fournisseurs et livraisons",
    icon: "Truck",
    permission: ["purchases"],
    summary:
      "Enregistrer un fournisseur, commander un ingrédient et réceptionner une livraison, même partielle.",
    minutes: 2,
    steps: [
      {
        module: "deliveries",
        target: ".section-heading .actions",
        title: "Fournisseurs et approvisionnements",
        body: "« Ajouter un fournisseur » enregistre un partenaire ; « Nouvel approvisionnement » commande une quantité d’un ingrédient avec sa date de livraison prévue.",
      },
      {
        module: "deliveries",
        target: ".card.table-scroll",
        title: "Suivre et réceptionner",
        body: "« Réceptionner » saisit la quantité reçue et la date limite : un lot est créé dans le stock. Une réception partielle laisse la commande ouverte pour le reste.",
      },
      {
        module: "deliveries",
        target: '[data-tour="nav-suppliers"]',
        title: "L’annuaire fournisseurs",
        body: "Retrouvez vos fournisseurs, leurs contacts et leurs délais indicatifs.",
      },
    ],
    guide: {
      lead: "Les achats alimentent le stock sans double saisie : réceptionner une livraison crée directement le lot correspondant.",
      sections: [
        {
          title: "Pas à pas",
          steps: [
            "Gestion › Fournisseurs › « Ajouter un fournisseur » (nom, contact).",
            "« Nouvel approvisionnement » : fournisseur, ingrédient, quantité, livraison prévue.",
            "À la livraison : « Réceptionner », quantité reçue et date limite du lot.",
            "Livraison incomplète : la commande passe « Partiellement reçue » et indique le restant.",
          ],
        },
        {
          title: "Bon à savoir",
          text: "Les commandes fournisseurs sont enregistrées dans atacuisine ; aucun bon n’est envoyé automatiquement au fournisseur. L’administration du restaurant propose aussi des commandes multilignes et des campagnes d’inventaire.",
        },
      ],
    },
  },
  {
    id: "customers",
    title: "Clients et fidélité",
    icon: "Heart",
    permission: ["customers"],
    summary:
      "Fiches clients, consentement, points et codes promo personnels à usage unique.",
    minutes: 3,
    steps: [
      {
        module: "customers",
        target: ".section-heading .btn",
        text: "Ajouter un client",
        title: "Créer une fiche client",
        body: "Nom, contact et consentement fidélité. Sans consentement, le client ne cumule pas de points.",
      },
      {
        module: "customers",
        target: ".card.table-scroll",
        title: "Le fichier client",
        body: "Chaque client avec son solde de points. Ajoutez ou retirez des points avec un motif : chaque mouvement est historisé.",
      },
      {
        module: "customers",
        target: ".section-heading .btn",
        text: "Créer un code promo",
        title: "Offrir un code personnel",
        body: "Un code unique, une remise en pourcentage ou en euros, un coût en points (0 pour un cadeau) et une date limite. Les points sont déduits à l’attribution.",
      },
      {
        module: "customers",
        target: ".three-grid",
        title: "Les codes attribués",
        body: "Partagez la fiche privée du code avec son titulaire. Au règlement, le client donne son code : il est marqué Utilisé. Annuler un code inutilisé restitue ses points une seule fois.",
        fallback:
          "Aucun code attribué pour le moment : créez-en un pour le voir ici.",
      },
    ],
    guide: {
      lead: "Le module Clients & fidélité réunit votre fichier client, les points de fidélité et les codes promo personnels utilisés au règlement en salle ou sur le site.",
      sections: [
        {
          title: "Offrir un code promo",
          steps: [
            "Relation client › Clients & fidélité › choisissez un client consentant.",
            "« Créer un code promo » : code unique (lettres, chiffres, tirets).",
            "Type de remise : pourcentage (entier) ou montant fixe en euros.",
            "Points à échanger (0 pour un cadeau) et date de validité.",
            "Partagez la fiche privée du code avec le client.",
          ],
        },
        {
          title: "Utiliser le code",
          points: [
            "En salle : à la déclaration du règlement, choisir le client titulaire et saisir son code.",
            "Sur le site : le client saisit son code à l’étape « Vos avantages » de la commande.",
            "Un seul code par addition, sans reliquat ; le montant net est enregistré.",
            "Un code utilisé, expiré ou annulé est refusé.",
          ],
        },
      ],
    },
  },
  {
    id: "team",
    title: "Équipe, planning et présences",
    icon: "Users",
    permission: ["team"],
    summary: "Planifier les services et suivre les pointages de l’équipe.",
    minutes: 2,
    steps: [
      {
        module: "team",
        target: ".section-heading .btn",
        text: "Planifier",
        title: "Planifier un service",
        body: "Choisissez un équipier, une heure de début et de fin. Un chevauchement avec un autre service du même équipier est détecté et refusé.",
      },
      {
        module: "team",
        target: ".three-grid",
        title: "L’équipe",
        body: "Les membres de l’établissement et leur rôle. Les invitations et les accès se gèrent dans l’administration du restaurant.",
      },
      {
        module: "attendance",
        target: ".actions",
        title: "Pointer son service",
        body: "Chaque membre de l’équipe pointe son début de service, ses pauses et sa fin de service. C’est un suivi opérationnel des heures, pas un calcul de paie.",
      },
    ],
    guide: {
      lead: "Le planning et les présences donnent une vision claire de qui travaille quand, sans remplacer votre outil de paie.",
      sections: [
        {
          title: "Planning",
          steps: [
            "Équipe › Équipe & planning › « Planifier un service ».",
            "Choisissez l’employé, le début et la fin.",
            "Supprimez un créneau depuis la liste si besoin.",
          ],
        },
        {
          title: "Présences",
          text: "Tous les profils ont accès au module Présences pour pointer leur propre service : début, pause, reprise, fin. Les pointages sont exportables pour être rapprochés de la paie.",
        },
        {
          title: "Inviter un collaborateur",
          text: "Dans l’administration du restaurant (onglet Équipe), invitez un collaborateur par e-mail et attribuez-lui un ou plusieurs rôles.",
        },
      ],
    },
  },
  {
    id: "finance",
    title: "Finances, dépenses et rapports",
    icon: "Receipt",
    permission: ["finance"],
    summary:
      "Suivre les règlements, exporter les ventes et enregistrer les dépenses.",
    minutes: 2,
    steps: [
      {
        module: "finance",
        target: ".metrics",
        title: "Le pilotage financier",
        body: "CA déclaré toutes dates, ticket moyen par déclaration, dépenses déclarées et coût matière théorique des produits vendus.",
      },
      {
        module: "finance",
        target: ".btn",
        text: "Exporter",
        title: "Exporter les règlements",
        body: "Téléchargez un fichier CSV des règlements pour votre comptable ou votre tableur.",
      },
      {
        module: "expenses",
        target: ".section-heading .btn",
        text: "Ajouter une dépense",
        title: "Les dépenses",
        body: "Enregistrez les dépenses opérationnelles (libellé, montant) pour suivre la rentabilité.",
      },
    ],
    guide: {
      lead: "Les chiffres financiers sont réservés au Propriétaire, au Comptable et au Super Admin. Ils proviennent directement des règlements déclarés.",
      sections: [
        {
          title: "Ce que vous pouvez faire",
          points: [
            "Consulter le CA déclaré, le ticket moyen, les dépenses et le coût matière théorique.",
            "Retrouver l’historique des règlements, avec leurs remises.",
            "Exporter les règlements en CSV.",
            "Enregistrer les dépenses opérationnelles.",
          ],
        },
        {
          title: "Limites",
          text: "Les exports sont des données à rapprocher : atacuisine n’est ni un logiciel de comptabilité ni une caisse certifiée.",
        },
      ],
    },
  },
  {
    id: "online",
    title: "Site web, commande en ligne et paiement client",
    icon: "Globe",
    permission: ["website"],
    summary:
      "Construire le site, puis suivre le parcours du client : panier, compte, créneau, code promo et paiement.",
    minutes: 3,
    steps: [
      {
        target: '[data-tour="nav-site"]',
        title: "Le studio du site",
        body: "« Mon site web » ouvre l’éditeur : sections et pages, histoire du restaurant, identité, polices, référencement. Prévisualisez sur ordinateur, tablette ou mobile, publiez, et restaurez une version précédente si besoin.",
      },
      {
        target: '[data-tour="public-link"]',
        title: "Le site de vos clients",
        body: "La carte, la commande en ligne, la réservation et l’espace client, alimentés par vos données : prix, disponibilités et horaires sont toujours à jour.",
        link: { label: "Ouvrir le site public", href: "/r/{restaurant}" },
      },
      {
        title: "Le parcours de commande du client",
        body: "1. Le client remplit son panier depuis la carte. 2. Il crée son compte ou se connecte. 3. Il choisit à emporter ou sur place et un créneau de retrait. 4. Il saisit un code promo et peut rejoindre la fidélité. 5. Il choisit le paiement et accepte les conditions de vente.",
      },
      {
        title: "Comment le client paie",
        body: "Deux modes : « Au comptoir » (carte ou espèces au retrait) ou « En ligne » via Stripe (mode test en démonstration). Après validation, la commande part directement en cuisine et le client suit son état sur une page de suivi.",
      },
      {
        target: '[data-tour="profile"]',
        title: "Côté équipe",
        body: "Les commandes du site apparaissent dans Commandes. Le paiement au comptoir se confirme dans l’administration du restaurant, onglet « Boutique et avis », qui règle aussi les horaires, les créneaux et le temps de préparation.",
      },
    ],
    guide: {
      lead: "Chaque établissement dispose d’un site complet relié au poste de travail : rien à ressaisir, la carte et les disponibilités sont toujours celles du jour.",
      sections: [
        {
          title: "Construire le site",
          steps: [
            "Configuration › Mon site web : l’éditeur s’ouvre sur la page d’accueil.",
            "Ouvrez Guide de création dans le studio pour suivre les étapes. Dans Pages, créez une page puis utilisez l’œil pour la rendre visible.",
            "Utilisez Ajouter une section pour insérer un texte, une bannière ou les catégories de la boutique. Dans Sections, sélectionnez un bloc pour modifier ses champs et utilisez les flèches pour le déplacer.",
            "Personnalisez l’identité et le référencement, puis contrôlez le résultat avec les icônes ordinateur, tablette et téléphone.",
            "Enregistrez votre brouillon, puis publiez pour mettre le site à jour. Historique permet de restaurer une publication précédente.",
          ],
        },
        {
          title: "Le parcours du client, de A à Z",
          steps: [
            "Le client parcourt la carte et ajoute des produits (options et précisions comprises).",
            "Au panier, il crée son compte ou se connecte : la commande rejoint son historique.",
            "Il choisit « À emporter » ou « Sur place » et un créneau de retrait parmi ceux disponibles.",
            "Il saisit un code promo ou fidélité et peut rejoindre le programme de fidélité.",
            "Il choisit le paiement : au comptoir (carte ou espèces) ou en ligne via Stripe.",
            "Il accepte les conditions générales de vente et valide : la commande part en cuisine.",
            "Il suit l’état de sa commande sur la page de suivi et retrouve ses récompenses dans son espace client.",
          ],
        },
        {
          title: "Côté équipe",
          points: [
            "Les commandes du site et du QR code de table apparaissent dans Commandes.",
            "Paiement au comptoir : l’équipe confirme le règlement dans Administration › Boutique et avis › Commandes boutique.",
            "Paiement en ligne : il est confirmé par le prestataire de paiement (Stripe test en démonstration).",
            "Horaires de commande, créneaux et temps de préparation se règlent dans Boutique et avis.",
            "Les avis des clients sont modérés avant publication.",
          ],
        },
      ],
      tip: "En démonstration, aucun paiement réel n’a lieu et aucun e-mail n’est envoyé : un aperçu du message s’affiche à la place.",
    },
  },
  {
    id: "admin",
    title: "Établissements, administration et sécurité",
    icon: "Settings",
    permission: ["settings", "audit", "security"],
    summary:
      "Paramétrer l’établissement, gérer plusieurs structures, suivre le journal et la sécurité.",
    minutes: 3,
    steps: [
      {
        module: "settings",
        target: ".two-grid .card",
        title: "Votre établissement",
        body: "Nom, adresse, téléphone et objectif journalier (utilisé par le tableau de bord).",
        fallback:
          "Les paramètres d’établissement sont réservés au Propriétaire et au Super Admin.",
      },
      {
        module: "settings",
        target: ".two-grid .card:last-child",
        title: "Une ou plusieurs structures",
        body: "Chaque forfait comprend un établissement. Les établissements supplémentaires bénéficient du même forfait. Un nouvel établissement démarre vide : carte, stocks et tables se créent depuis ses modules.",
      },
      {
        target: '[data-tour="nav-activity"]',
        title: "Le journal d’activité",
        body: "Chaque action importante (commande, règlement, correction de stock, modification de la carte) est tracée avec son auteur et sa date.",
      },
      {
        target: '[data-tour="nav-security"]',
        title: "La sécurité opérationnelle",
        body: "Le centre de sécurité suit les incidents, les corrections et les archives quotidiennes, limité au restaurant courant.",
      },
      {
        target: '[data-tour="profile"]',
        title: "L’administration du restaurant",
        body: "Équipe et accès, boutique et avis, fidélité, site, domaine personnalisé, stocks et achats multilignes, conflits hors ligne et connexions. C’est le centre de contrôle du propriétaire.",
      },
      {
        title: "Vous êtes prêt",
        body: "Vous connaissez maintenant tout atacuisine. Le guide complet reprend chaque fonctionnalité par écrit, avec les règles détaillées et les rôles.",
        link: { label: "Lire le guide complet", href: "/guide" },
      },
    ],
    guide: {
      lead: "La configuration regroupe ce qui structure votre organisation : établissements, offre, équipe, sécurité et traçabilité.",
      sections: [
        {
          title: "Organisation et établissements",
          points: [
            "Une organisation regroupe un ou plusieurs établissements (structures).",
            "Un établissement inclus, puis 39 € HT par mois par établissement supplémentaire.",
            "Les données de chaque structure sont cloisonnées, jusque dans la base de données.",
            "Un nouvel établissement démarre vide.",
          ],
        },
        {
          title: "Administration du restaurant",
          points: [
            "Équipe : inviter un collaborateur, attribuer les rôles, accès temporaires du support.",
            "Boutique et avis : réglages de commande, commandes boutique, modération des avis.",
            "Fidélité : règles de points et récompenses.",
            "Domaines : relier votre propre nom de domaine (preuve DNS).",
            "Stocks et achats : ingrédients, commandes fournisseurs multilignes, campagnes d’inventaire.",
            "Conflits hors ligne et connexions : réconciliation des appareils et services spécialisés.",
          ],
        },
        {
          title: "Mode hors ligne",
          text: "Le poste de service hors ligne (/offline) prépare un appareil avec des quotas de stock pour continuer à prendre des commandes pendant une coupure. Les tickets restent sur l’appareil et se réconcilient au retour du réseau.",
        },
        {
          title: "Traçabilité et sécurité",
          text: "Le journal d’activité enregistre chaque action. Le centre de sécurité opérationnelle suit les incidents, les corrections et les archives quotidiennes.",
        },
      ],
    },
  },
];

/** Le parcours est-il accessible à ce profil ? */
export const chapterAllowed = (
  chapter: Chapter,
  userRoles: Role | readonly Role[],
) => !chapter.permission || chapter.permission.some((p) => can(userRoles, p));

/** Rôles (hors Super Admin) qui peuvent suivre ce parcours, pour l’indiquer aux autres. */
export const chapterRoles = (chapter: Chapter) =>
  roles
    .filter((r) => r !== "SUPER_ADMIN" && chapterAllowed(chapter, r))
    .map((r) => roleLabels[r]);

/** Repères de vocabulaire, communs au guide et à la visite. */
export const glossary: { term: string; definition: string }[] = [
  {
    term: "Organisation",
    definition:
      "Votre entreprise cliente. Elle regroupe un ou plusieurs établissements selon l’offre.",
  },
  {
    term: "Établissement (structure)",
    definition:
      "Un restaurant, avec sa carte, ses tables, ses stocks, son équipe et son site. Ses données sont cloisonnées.",
  },
  {
    term: "Session de table",
    definition:
      "L’ensemble des commandes d’une même tablée, réglées en une seule déclaration.",
  },
  {
    term: "Poste (station)",
    definition: "Cuisine ou Bar : l’écran qui reçoit le ticket d’un produit.",
  },
  {
    term: "Stock physique / réservé / disponible",
    definition:
      "Ce qui est en réserve / ce que les commandes en attente vont utiliser / la différence, hors lots expirés.",
  },
  {
    term: "Lot",
    definition:
      "Une quantité reçue d’un ingrédient, avec sa date limite et son emplacement.",
  },
  {
    term: "Règlement déclaré",
    definition:
      "L’enregistrement d’un paiement encaissé avec votre terminal ou en espèces. atacuisine n’encaisse pas lui-même en salle.",
  },
  {
    term: "Code promo personnel",
    definition:
      "Une remise nominative à usage unique, éventuellement échangée contre des points de fidélité.",
  },
];
