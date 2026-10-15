-- Journal d'événements métier (socle de l'historique opérationnel et des automatisations).
-- Distinct de audit_logs, qui reste le journal de sécurité.
CREATE TABLE domain_events (
 id text PRIMARY KEY,
 restaurant_id text NOT NULL REFERENCES restaurants,
 type text NOT NULL,
 module text NOT NULL,
 actor text REFERENCES profiles,
 object_id text,
 summary text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}',
 permissions text[],
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
CREATE INDEX events_restaurant_date ON domain_events(restaurant_id,created_at);
CREATE INDEX events_unprocessed ON domain_events(created_at) WHERE processed_at IS NULL;
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

-- Notifications existantes conservées : valeurs par défaut = visibles par tous, priorité normale.
ALTER TABLE notifications ADD COLUMN type text NOT NULL DEFAULT 'system.info';
ALTER TABLE notifications ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical'));
ALTER TABLE notifications ADD COLUMN module text;
ALTER TABLE notifications ADD COLUMN object_id text;
ALTER TABLE notifications ADD COLUMN permissions text[];
ALTER TABLE notifications ADD COLUMN recipient text REFERENCES profiles;
ALTER TABLE notifications ADD COLUMN event_id text REFERENCES domain_events;
ALTER TABLE notifications ADD COLUMN dedup_key text;
CREATE UNIQUE INDEX notifications_dedup ON notifications(restaurant_id,dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX notifications_restaurant_date ON notifications(restaurant_id,created_at);

CREATE TABLE notification_preferences (
 profile_id text NOT NULL REFERENCES profiles,
 restaurant_id text NOT NULL REFERENCES restaurants,
 type text NOT NULL,
 muted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(profile_id,restaurant_id,type)
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_versions VALUES(3);
