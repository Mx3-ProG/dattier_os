# Dépendances statiques de référence

Relevé des imports `@/features/…` dans les fichiers TS/TSX. Une flèche signifie « importe ». Ce relevé ne couvre pas tous les imports relatifs, le SQL partagé ou les dépendances à l’exécution ; il ne prouve donc pas une indépendance des modules.

| Domaine consommateur | Domaines importés |
| --- | --- |
| `app` | `appearance`, `assistant`, `bank`, `billing`, `cms`, `commerce`, `finance`, `hr`, `integrations`, `invoices`, `offline`, `ops-security`, `orders`, `payments`, `platform`, `qr`, `reservations`, `seo`, `site` |
| `appearance` | `ops-security` |
| `assistant` | `finance`, `guide`, `platform` |
| `bank` | `assistant`, `billing`, `finance`, `invoices`, `orders` |
| `billing` | `finance`, `orders`, `platform` |
| `catalog` | `orders` |
| `cms` | `commerce`, `orders`, `platform` |
| `commerce` | `finance`, `loyalty`, `orders`, `payments`, `platform` |
| `components` | `appearance`, `assistant`, `cms`, `commerce`, `finance`, `guide`, `messaging`, `offline`, `ops-security`, `platform`, `qr`, `seo`, `site` |
| `finance` | `bank`, `billing`, `hr`, `orders`, `platform` |
| `floor` | `orders` |
| `hr` | `orders`, `platform` |
| `integrations` | `orders` |
| `invoices` | `assistant`, `finance`, `orders`, `platform`, `site` |
| `lib` | `catalog`, `commerce`, `floor`, `loyalty`, `messaging`, `ops-security`, `orders`, `platform`, `reservations` |
| `loyalty` | `orders` |
| `offline` | `orders` |
| `ops-security` | `orders` |
| `orders` | `finance`, `loyalty`, `ops-security`, `platform` |
| `payments` | `commerce`, `finance`, `orders`, `platform` |
| `platform` | `commerce`, `floor`, `loyalty`, `offline`, `ops-security`, `orders`, `seo`, `site` |
| `proxy.ts` | `seo` |
| `qr` | `orders` |
| `reservations` | `orders` |
| `seo` | `cms`, `commerce`, `orders` |
| `site` | `orders` |

## Contrats à dégager en premier

- Journalisation et notifications hors du service commandes.
- Droits commerciaux hors des comparaisons de montants.
- Fournisseurs de données du Pilotage hors des composants.
- Projections spécifiques aux modules hors du snapshot global.
- Disponibilité et consommation de stock avec invariants transactionnels conservés.
- Blocs publics du CMS conditionnés par la capacité réellement disponible.

Ne pas remplacer systématiquement les appels transactionnels par des événements asynchrones : les invariants de stock et de règlement doivent rester garantis.
