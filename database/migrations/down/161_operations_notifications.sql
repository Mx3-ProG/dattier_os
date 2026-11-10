-- Retour arrière du centre de notifications : les notifications restent, sans leurs colonnes ajoutées.
DROP TABLE IF EXISTS public.notification_preferences;
DROP TRIGGER IF EXISTS tenant_fk_event_id ON public.notifications;
DROP INDEX IF EXISTS public.notifications_restaurant_date;
DROP INDEX IF EXISTS public.notifications_dedup;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;
ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS dedup_key,
  DROP COLUMN IF EXISTS event_id,
  DROP COLUMN IF EXISTS recipient,
  DROP COLUMN IF EXISTS permissions,
  DROP COLUMN IF EXISTS object_id,
  DROP COLUMN IF EXISTS module,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS type;
DROP TABLE IF EXISTS public.domain_events;
DELETE FROM schema_versions WHERE version=161;
