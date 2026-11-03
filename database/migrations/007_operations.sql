ALTER TABLE outbox_jobs ADD COLUMN lease_token text;
CREATE INDEX customer_account_restaurant ON customers(account_id,restaurant_id) WHERE account_id IS NOT NULL;
CREATE FUNCTION app.check_account_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_customers c JOIN restaurants r ON r.organization_id=c.organization_id WHERE c.id=NEW.account_id AND r.id=NEW.restaurant_id) THEN RAISE EXCEPTION 'Compte hors organisation'; END IF; RETURN NEW; END $$;
CREATE TRIGGER customer_account_scope BEFORE INSERT OR UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION app.check_account_scope();
CREATE FUNCTION app.claim_jobs(worker_token text) RETURNS SETOF outbox_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE outbox_jobs SET status='running',attempts=attempts+1,lease_token=worker_token,locked_until=now()+interval '2 minutes' WHERE id IN (SELECT id FROM outbox_jobs WHERE attempts<5 AND available_at<=now() AND (status='pending' OR (status='running' AND locked_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING * $$;
REVOKE ALL ON FUNCTION app.claim_jobs(text) FROM PUBLIC;
CREATE TRIGGER audit_event AFTER INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION app.emit_event();
INSERT INTO schema_versions VALUES(7);
