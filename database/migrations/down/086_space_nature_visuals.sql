-- Les licences et commandes existantes protègent les modèles acquis.
DELETE FROM public.addon_products WHERE id IN (
  'site-bg-space-orbit','site-bg-space-stars','site-bg-space-moon','site-bg-space-comet',
  'site-bg-space-rocket','site-bg-space-planet','site-bg-space-nebula','site-bg-space-galaxy',
  'site-bg-space-station','site-bg-space-wormhole','site-bg-space-supernova','site-bg-space-cosmos',
  'site-bg-nature-leaf','site-bg-nature-forest','site-bg-nature-river','site-bg-nature-blossom',
  'site-bg-nature-meadow','site-bg-nature-mountain','site-bg-nature-waterfall','site-bg-nature-canopy',
  'site-bg-nature-ocean','site-bg-nature-biosphere','site-bg-nature-coral','site-bg-nature-rainforest',
  'not-found-space-orbit','not-found-space-stars','not-found-space-moon','not-found-space-comet',
  'not-found-space-rocket','not-found-space-planet','not-found-space-nebula','not-found-space-galaxy',
  'not-found-space-station','not-found-space-wormhole','not-found-space-supernova','not-found-space-cosmos',
  'not-found-nature-leaf','not-found-nature-forest','not-found-nature-river','not-found-nature-blossom',
  'not-found-nature-meadow','not-found-nature-mountain','not-found-nature-waterfall','not-found-nature-canopy',
  'not-found-nature-ocean','not-found-nature-biosphere','not-found-nature-coral','not-found-nature-rainforest',
  'loader-space-orbit','loader-space-stars','loader-space-moon','loader-space-comet',
  'loader-space-rocket','loader-space-planet','loader-space-nebula','loader-space-galaxy',
  'loader-space-station','loader-space-wormhole','loader-space-supernova','loader-space-cosmos',
  'loader-nature-leaf','loader-nature-forest','loader-nature-river','loader-nature-blossom',
  'loader-nature-meadow','loader-nature-mountain','loader-nature-waterfall','loader-nature-canopy',
  'loader-nature-ocean','loader-nature-biosphere','loader-nature-coral','loader-nature-rainforest',
  'site-decoration-space-orbit','site-decoration-space-stars','site-decoration-space-moon','site-decoration-space-comet',
  'site-decoration-space-rocket','site-decoration-space-planet','site-decoration-space-nebula','site-decoration-space-galaxy',
  'site-decoration-space-station','site-decoration-space-wormhole','site-decoration-space-supernova','site-decoration-space-cosmos',
  'site-decoration-nature-leaf','site-decoration-nature-forest','site-decoration-nature-river','site-decoration-nature-blossom',
  'site-decoration-nature-meadow','site-decoration-nature-mountain','site-decoration-nature-waterfall','site-decoration-nature-canopy',
  'site-decoration-nature-ocean','site-decoration-nature-biosphere','site-decoration-nature-coral','site-decoration-nature-rainforest'
);
DELETE FROM schema_versions WHERE version=86;
