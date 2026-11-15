/**
 * Registre des handlers d'événements par module.
 *
 * Chaque module qui souhaite réagir à des événements importe `on` depuis
 * `@/features/events/public` et s'abonne ici (ou dans son propre fichier
 * d'événements importé ci-dessous). Le worker importe ce fichier au démarrage
 * pour que les handlers soient enregistrés avant le traitement des jobs.
 *
 * Ajouter un import side-effect par module abonné.
 */
import "@/features/orders/events";
import "@/features/finance/events";
