-- domain_events.module et notifications.module désignent la rubrique d'activité
-- (identifiant de module de l'espace de travail, cf. src/features/events/categories.ts).
-- Les notifications antérieures au centre de notifications rejoignent la rubrique « Général ».
UPDATE public.notifications n SET module=e.module FROM public.domain_events e WHERE e.id=n.event_id AND n.module IS NULL;
UPDATE public.notifications SET module='general' WHERE module IS NULL;
CREATE INDEX IF NOT EXISTS events_restaurant_module_date ON public.domain_events(restaurant_id,module,created_at);
INSERT INTO schema_versions(version) VALUES(162) ON CONFLICT DO NOTHING;
