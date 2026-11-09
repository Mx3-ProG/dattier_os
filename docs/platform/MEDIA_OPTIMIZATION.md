# Médias du studio : dépôt et optimisation

Les nouveaux imports du CMS passent obligatoirement par le même moteur serveur avant leur insertion dans la médiathèque. Le navigateur envoie l’original ; la compression est effectuée sur le serveur avant stockage durable et avant insertion dans le brouillon. Un échec de conversion refuse l’import, sans repli sur l’original.

## Utilisation

- Déposer un fichier sur une image de l’aperçu remplace l’image du bloc (la première image éditable lorsque le bloc en contient plusieurs).
- Sur une galerie, une image est ajoutée ; sur un bloc vidéo, une vidéo remplace sa source.
- Sur une autre section de contenu, un nouveau bloc média est inséré après celle-ci. Hors section, il est ajouté en fin de page.
- Un lot de 2 à 10 fichiers ajoute des blocs en fin de page, un fichier après l’autre, sans écraser les images existantes.
- Les champs image, galerie, vidéo et la médiathèque acceptent aussi le dépôt d’un fichier ou le sélecteur de fichiers (notamment sur mobile).
- Les pages système et légales et les blocs verrouillés restent protégés. Le choix de types de sections autorisés est respecté.
- L’insertion reste dans le brouillon. Annuler retire le bloc du brouillon, pas le média de la bibliothèque. Compléter les textes alternatifs avant publication.

## Traitement

| Entrée | Sortie |
| --- | --- |
| JPG, PNG, WebP fixes, jusqu’à 32 Mo / 40 mégapixels | WebP qualité 78, côté maximal 2 000 px, sans agrandissement, orientation corrigée, métadonnées retirées |
| MP4, MOV, WebM, jusqu’à 100 Mo / 120 secondes | MP4 H.264/AAC, cadre maximal 1 280 × 720, sans agrandissement, 30 images/s, CRF 28, audio 96 kbit/s, démarrage rapide |

La vidéo finale est limitée à 24 Mo. Les fichiers temporaires de transcodage sont supprimés dans un bloc `finally`. La médiathèque et les URL publiques ne reçoivent que le fichier converti. Les médias déjà importés ne sont pas retraités automatiquement. Une petite source déjà optimisée peut ressortir plus lourde ; le bilan affiche les tailles réelles, sans promettre un taux de réduction.

Le quota existant de 500 fichiers et 512 Mo par établissement (configurable avec `CMS_STORAGE_LIMIT_MB`) porte désormais sur la taille finale. Les lectures vidéo partielles locales lisent uniquement les octets demandés. Les lectures S3 utilisent déjà Range.

## Exploitation et limites

FFmpeg et FFprobe sont requis sur le serveur Node. Le Dockerfile les installe ; sur une autre installation, les binaires doivent être présents dans PATH ou configurés par `FFMPEG_PATH` / `FFPROBE_PATH`. Le mode local a été vérifié avec les binaires installés. Aucun déploiement de production n’a été effectué.

Deux imports maximum par processus web ; les imports excédentaires sont refusés avec un message de nouvelle tentative. En production, le transcodage vidéo tourne dans le groupe de workers `media` : l’envoi rend la main aussitôt, la médiathèque affiche « en cours » puis « échec » le cas échéant, et une vidéo non prête ne peut pas entrer dans un brouillon. La démonstration n’a pas de worker et garde le traitement direct. La conversion vidéo est limitée à 180 secondes. Les médias sont diffusés en flux, une fois la transaction de contrôle fermée. Voir [WORKER_GROUPS.md](WORKER_GROUPS.md).

Ce moteur convient aux médias courts de sites de restaurants : ce n’est pas une plateforme de traitement de rushes longs.

## Vérification

Tests `tests/media-optimizer.test.ts` : redimensionnement WebP, transparence, suppression de métadonnées, vrai transcodage vidéo, fichiers invalides, limite de concurrence, insertion et protection des pages. Parcours navigateur : import groupé d’une image PNG et d’un rush MOV, conversion, insertion des deux blocs dans le brouillon et annulation sans publication.

Référence du traitement image : [documentation Sharp](https://sharp.pixelplumbing.com/api-output/).
