-- Centre de notifications et historique opérationnel (porté de la branche
-- claude/intelligent-notification-center-503c67, migrations 003/004 renumérotées).
-- Journal d'événements métier : socle de l'historique et des futures automatisations.
-- Distinct de audit_logs, qui reste le journal de sécurité.
-- Idempotent : plusieurs sessions de développement partagent la même base de démonstration.
CREATE TABLE IF NOT EXISTS public.domain_events (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES public.restaurants(id),
 type text NOT NULL CHECK (length(type) BETWEEN 1 AND 80),
 module text NOT NULL CHECK (length(module) BETWEEN 1 AND 40),
 actor text REFERENCES public.profiles(id),
 object_id text,
 summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 permissions text[],
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS events_restaurant_date ON public.domain_events(restaurant_id,created_at);
CREATE INDEX IF NOT EXISTS events_unprocessed ON public.domain_events(created_at) WHERE processed_at IS NULL;

-- Notifications existantes conservées : valeurs par défaut = visibles par tous, priorité normale.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'system.info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS module text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS object_id text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS permissions text[];
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient text REFERENCES public.profiles(id);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_id text REFERENCES public.domain_events(id);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedup_key text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_priority_check') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_priority_check CHECK (priority IN ('low','normal','high','critical'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup ON public.notifications(restaurant_id,dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_restaurant_date ON public.notifications(restaurant_id,created_at);

-- Une notification ne peut pas pointer vers l'événement d'un autre établissement (cf. 060).
DROP TRIGGER IF EXISTS tenant_fk_event_id ON public.notifications;
CREATE TRIGGER tenant_fk_event_id BEFORE INSERT OR UPDATE OF event_id ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION app.guard_same_tenant('event_id','domain_events','id');

CREATE TABLE IF NOT EXISTS public.notification_preferences (
 profile_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 type text NOT NULL CHECK (length(type) BETWEEN 1 AND 60),
 muted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(restaurant_id,profile_id,type)
);

-- Isolation (modèle 060) : chaque établissement ne voit que ses lignes. Le canal public
-- (réservation, commande en ligne) peut déposer un événement mais jamais le relire.
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON public.domain_events;
CREATE POLICY tenant_access ON public.domain_events FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id)) WITH CHECK (app.in_restaurant(restaurant_id));
DROP POLICY IF EXISTS public_no_read ON public.domain_events;
CREATE POLICY public_no_read ON public.domain_events AS RESTRICTIVE FOR SELECT USING (app.not_public());
DROP POLICY IF EXISTS public_no_update ON public.domain_events;
CREATE POLICY public_no_update ON public.domain_events AS RESTRICTIVE FOR UPDATE USING (app.not_public());
DROP POLICY IF EXISTS public_no_delete ON public.domain_events;
CREATE POLICY public_no_delete ON public.domain_events AS RESTRICTIVE FOR DELETE USING (app.not_public());
REVOKE ALL ON public.domain_events FROM PUBLIC;
-- Journal en ajout seul : ni modification ni suppression par l'application.
GRANT SELECT,INSERT ON public.domain_events TO atacuisine_app;

-- Préférences : chaque profil ne lit et n'écrit que les siennes.
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_preferences ON public.notification_preferences;
CREATE POLICY own_preferences ON public.notification_preferences FOR ALL TO atacuisine_app
  USING (profile_id=app.user_id() AND app.in_restaurant(restaurant_id))
  WITH CHECK (profile_id=app.user_id() AND app.in_restaurant(restaurant_id));
DROP POLICY IF EXISTS public_denied ON public.notification_preferences;
CREATE POLICY public_denied ON public.notification_preferences AS RESTRICTIVE USING (app.not_public()) WITH CHECK (app.not_public());
REVOKE ALL ON public.notification_preferences FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.notification_preferences TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(161) ON CONFLICT DO NOTHING;
