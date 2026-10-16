# Médias du site public

## Vidéo de fond de l’accueil

Déposez la vraie vidéo du restaurant ici, sous ce nom exact :

    public/media/hero.mp4

Le hero de l’accueil la charge en priorité. Tant que ce fichier n’existe pas,
le navigateur passe à `hero-placeholder.mp4` : un dégradé abstrait aux couleurs
de la maison, signalé à l’écran comme « vidéo provisoire ». Il ne représente
pas le restaurant.

Conseils pour le fichier :

- MP4 (H.264), sans son (elle est lue en muet), 10 à 20 s qui bouclent bien ;
- 1920×1080 au maximum, idéalement moins de 6 Mo (`-crf 28`, `-movflags +faststart`) ;
- remplacez aussi `hero-poster.jpg` par une image extraite de la vidéo :
  c’est elle qui s’affiche pendant le chargement et pour les personnes qui
  ont demandé moins d’animations.

Exemple avec ffmpeg :

    ffmpeg -i film.mov -an -vf "scale=1920:-2" -c:v libx264 -crf 28 -preset slow -movflags +faststart public/media/hero.mp4
    ffmpeg -ss 2 -i public/media/hero.mp4 -frames:v 1 -q:v 4 public/media/hero-poster.jpg
