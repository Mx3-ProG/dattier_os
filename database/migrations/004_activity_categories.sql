-- domain_events.module et notifications.module désignent désormais la rubrique
-- d'activité (identifiant de module de l'espace de travail, cf. events/categories.ts).
UPDATE domain_events SET module=CASE module
 WHEN 'stock' THEN 'stocks'
 WHEN 'finance' THEN 'expenses'
 WHEN 'purchases' THEN 'deliveries'
 WHEN 'catalog' THEN 'menu'
 ELSE module END;
UPDATE domain_events e SET module=CASE WHEN e.data->>'station'='bar' THEN 'bar' ELSE 'kitchen' END
 WHERE e.type IN ('order.created','order.ready','order.late') AND e.module='orders';
UPDATE notifications n SET module=e.module FROM domain_events e WHERE e.id=n.event_id;
UPDATE notifications SET module='general' WHERE module IS NULL;
CREATE INDEX events_restaurant_module_date ON domain_events(restaurant_id,module,created_at);
INSERT INTO schema_versions VALUES(4);
