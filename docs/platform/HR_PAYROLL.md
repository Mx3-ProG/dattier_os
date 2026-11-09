# RH et préparation de la paie

Couche au-dessus du pointage existant, qui reste la source. **Aucun bulletin de paie ni déclaration sociale n'est produit.** Les variables préparées sont destinées au gestionnaire de paie, qui reste responsable du calcul de la paie.

## Heures

- **Calcul :** temps entre la prise de poste et la fin de service, moins les pauses, rattaché au jour de prise de poste à l'heure de Paris.
- **Heure incertaine :** une sortie oubliée n'est jamais estimée. La période reste non comptée et signalée. Un service en cours n'est ni compté ni signalé.
- **Signalements :** sortie manquante, pointage incohérent, journée de plus de 12 h, créneau planifié sans pointage.
- **Corrections :** réservées aux rôles qui gèrent l'équipe, avec un motif. Un pointage n'est jamais effacé : il est annulé, ou complété par une correction tracée. Le pointage du collaborateur repart ensuite du bon état.

## Heures supplémentaires

Calculées par semaine, du lundi au dimanche. **Une semaine appartient au mois de son dimanche.** Valeurs proposées, à confirmer :

| Tranche | Heures | Majoration proposée |
| --- | --- | --- |
| 1 | De 35 h à 39 h | 10 % |
| 2 | De 39 h à 43 h | 20 % |
| 3 | Au-delà de 43 h | 50 % |

Ces valeurs viennent de la [convention HCR, selon le Code du travail numérique](https://code.travail.gouv.fr/contribution/1979-heures-supplementaires) et d'autres sources secondaires, à vérifier sur le texte étendu. Elles sont modifiables, et **le mois ne peut pas être clôturé tant que l'établissement ne les a pas confirmées.** Les heures complémentaires d'un temps partiel sont comptées sans majoration, faute de règle vérifiée.

**Non calculés :** contingent annuel, repos compensateur, avantage en nature repas, heures de nuit, jours fériés, modulation du temps de travail. Le contingent diverge selon les sources.

## Absences et congés

Saisies et validées par les rôles qui gèrent l'équipe : congés payés, maladie, sans solde, événement familial, autre. Les jours sont des jours ouvrables hors dimanche, **jours fériés non déduits**.

**Pas encore couvert :** demande d'absence par le collaborateur lui-même, acquisition et solde de congés. Ils dépendent de règles à confirmer.

## Coût de personnel

Heures pointées × taux horaire brut, plus les majorations, plus les charges patronales si l'établissement renseigne une estimation. Un employé sans contrat n'est pas compté à un taux supposé : il est nommé, et le chiffre passe en « incomplet ». **Estimation seulement :** ni congés payés, ni primes, ni cotisations réelles.

Ce coût alimente le résultat prévisionnel, qui reste distinct du résultat comptable.

## Clôture et export

La clôture exige des règles confirmées et aucun pointage à corriger. Elle fige les variables : le mois refuse ensuite toute correction jusqu'à sa réouverture, motivée et tracée. L'export CSV n'est possible que sur un mois clôturé et ne contient aucun taux ni salaire. Sa structure est à adapter au gestionnaire de paie utilisé.

## Droits et données personnelles

| Rôle | Heures et absences | Contrats, coûts, clôture, export |
| --- | --- | --- |
| Propriétaire, Super Admin | Lecture et gestion | Oui |
| Comptabilité | Lecture | Oui |
| Manager | Lecture et gestion | Non, y compris en base |
| Autres rôles | Non | Non |

Les taux et les motifs d'absence restent hors du journal d'activité. Le type « maladie » reste une donnée sensible : à inscrire au registre RGPD, avec une durée de conservation à définir. L'accès aux chiffres par l'IA générative exclut les données nominatives de paie : l'outil financier ne renvoie que des totaux et des noms de collaborateurs sans contrat.

## Intégrations

Aucune connexion à PayFit ni à Silae : je n'ai pas pu confirmer qu'une API officielle permet d'écrire les variables de paie. L'export CSV couvre le besoin en attendant. Pas d'intégration d'ERPNext, Odoo ou Dolibarr, qui ajouteraient un second système à exploiter.

## Limites

- **Plusieurs établissements :** les heures sont calculées par établissement. Un salarié qui travaille dans deux restaurants voit ses heures supplémentaires sous-estimées.
- **Coût sur une période :** les majorations suivent le dimanche de la semaine, donc une période qui coupe une semaine ne les porte pas toutes.
- **Validation requise :** ces règles n'ont été relues ni par un gestionnaire de paie ni par un juriste.

Retour arrière (`down/040_hr_payroll.sql`) : réservé à la préproduction, refusé dès qu'une donnée RH existe.
