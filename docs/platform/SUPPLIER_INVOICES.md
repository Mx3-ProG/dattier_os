# Factures fournisseurs

Dépôt, lecture assistée, validation humaine, puis écritures. **Rien n'est comptabilisé sans validation.** Pré-comptabilité à valider par l'expert-comptable.

## Parcours

1. **Dépôt :** photo, PDF ou XML, un ou plusieurs fichiers, 15 Mo au maximum. Le format est reconnu au contenu réel. Le fichier est archivé tel quel, dans le stockage privé, avec son empreinte SHA-256. Un même fichier déposé deux fois est signalé.
2. **Lecture, dans cet ordre :**
   - XML Factur-X intégré au PDF, ou XML CII et UBL seuls : données certaines, sans IA ni coût ;
   - sinon, extraction par Claude si `ANTHROPIC_API_KEY` est présente. Le coût réel est débité en crédits Cuisine IA ;
   - sinon, ou en cas de panne ou de refus : saisie manuelle. Le dépôt n'est jamais perdu.
3. **Contrôles :** champs requis, HT + TVA = TTC, dates, doublon par fournisseur et numéro, insensible à l'écriture. Une valeur lue mais impossible reste vide. Un champ douteux est signalé.
4. **Validation :** le restaurateur corrige et valide. Un fournisseur inconnu rejoint le carnet.
5. **Règlement :** marqué à la main pour l'instant. Le rapprochement bancaire viendra avec le lot 5.
6. **Annulation :** contre-passation complète. Le justificatif reste. La facture peut être reprise.

## Écritures

| Moment | Débit | Crédit |
| --- | --- | --- |
| Validation, assujetti | Charge (HT) et 44566 (TVA) | 401 (TTC) |
| Validation, franchise | Charge (TTC) | 401 (TTC) |
| Règlement | 401 | 512 ou 530 |

Comptes de charge selon la catégorie : 607 marchandises, 6061 énergie, 6063 fournitures, 613 locations, 615 entretien, 6226 honoraires, 628 autres. Une facture à plusieurs taux est enregistrée sur ses totaux, sans ventilation par taux.

## Sécurité

- Accès réservé aux rôles financiers, en base comme dans les services. Justificatifs jamais publics et jamais supprimés par l'application.
- Extraction **sans aucun outil** : un texte malveillant dans une facture ne peut déclencher aucune action. La sortie suit un schéma strict, puis repasse par les contrôles.
- XML lu sans résolution d'entités externes.
- Seuls les PDF et les images s'affichent dans le navigateur. Le XML est téléchargé.

**Données personnelles :** les photos et PDF simples sont envoyés à Anthropic pour lecture. À mentionner dans le registre RGPD et les conditions.

## Pas encore couvert

- **Adresse e-mail dédiée :** exige un service de réception d'e-mails, non raccordé.
- **Plateforme agréée de facturation électronique :** contrat à choisir. La réception officielle ne passe pas encore par Dattier. Le restaurateur doit disposer de sa propre solution de réception, à vérifier avec son expert-comptable.
- **Avoirs** (montants négatifs) refusés pour l'instant.
- **Photos HEIC** refusées. Les navigateurs fournissent en général du JPEG.
- **Lien avec les commandes d'achat et les réceptions**, et prix d'achat par ingrédient : pas encore rapprochés.
- **Double compte possible :** une charge saisie dans Dépenses et aussi déposée en facture compte deux fois dans le résultat estimé.
- **Durée de conservation** à confirmer avec l'expert-comptable.

Retour arrière (`down/038_supplier_invoices.sql`) : réservé à la préproduction, refusé dès qu'un justificatif existe.

## Non vérifié

L'extraction n'a été testée qu'avec une IA simulée, faute de clé. Sa précision sur de vraies factures reste à mesurer, et son coût réel à observer. Factur-X est testé sur des fichiers générés, pas encore sur des factures de vrais fournisseurs.
