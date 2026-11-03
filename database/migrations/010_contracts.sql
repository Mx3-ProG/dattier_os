ALTER TABLE orders ADD COLUMN request_hash text;
CREATE FUNCTION app.organization_sales(oid text) RETURNS TABLE(restaurant_id text,restaurant_name text,sales bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.name,coalesce(sum(p.amount),0)::bigint FROM restaurants r LEFT JOIN orders o ON o.restaurant_id=r.id LEFT JOIN payment_declarations p ON p.order_id=o.id WHERE r.organization_id=oid AND app.org_admin(oid) GROUP BY r.id,r.name
 UNION ALL
 SELECT r.id,r.name,coalesce(sum(p.amount),0)::bigint FROM restaurants r JOIN dining_tables t ON t.restaurant_id=r.id JOIN table_sessions s ON s.table_id=t.id JOIN payment_declarations p ON p.session_id=s.id WHERE r.organization_id=oid AND app.org_admin(oid) GROUP BY r.id,r.name $$;
REVOKE ALL ON FUNCTION app.organization_sales(text) FROM PUBLIC;
INSERT INTO shop_settings(restaurant_id,config) SELECT r.id,jsonb_build_object('open',false,'prepMinutes',20,'interval',15,'capacity',10,'hours','[]'::jsonb,'categories',coalesce((SELECT jsonb_agg(category ORDER BY category) FROM (SELECT DISTINCT category FROM menu_items WHERE restaurant_id=r.id) c),'["Entrées","Plats","Desserts","Boissons"]'::jsonb),'address',r.address,'phone',r.phone,'logo','') FROM restaurants r ON CONFLICT DO NOTHING;
INSERT INTO site_documents(restaurant_id) SELECT id FROM restaurants ON CONFLICT DO NOTHING;
INSERT INTO organization_memberships(organization_id,profile_id,role) SELECT DISTINCT r.organization_id,m.profile_id,'OWNER' FROM memberships m JOIN restaurants r ON r.id=m.restaurant_id WHERE m.role IN ('OWNER','SUPER_ADMIN') ON CONFLICT DO NOTHING;
CREATE FUNCTION app.set_loyalty_scope(oid text,new_scope text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE current_scope text; BEGIN
 IF NOT app.org_admin(oid) OR new_scope NOT IN ('restaurant','organization') THEN RAISE EXCEPTION 'Acces refuse'; END IF;
 SELECT loyalty_scope INTO current_scope FROM organizations WHERE id=oid FOR UPDATE;
 IF current_scope<>new_scope AND (EXISTS(SELECT 1 FROM customers c JOIN restaurants r ON r.id=c.restaurant_id WHERE r.organization_id=oid AND c.points<>0) OR EXISTS(SELECT 1 FROM loyalty_wallets w JOIN organization_customers c ON c.id=w.account_id WHERE c.organization_id=oid AND w.points<>0)) THEN RAISE EXCEPTION 'Rapprochez les soldes avant de changer le perimetre'; END IF;
 UPDATE organizations SET loyalty_scope=new_scope WHERE id=oid;
 END $$;
REVOKE ALL ON FUNCTION app.set_loyalty_scope(text,text) FROM PUBLIC;
INSERT INTO schema_versions VALUES(10);
