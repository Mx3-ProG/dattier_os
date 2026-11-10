-- Cuisine IA : crédits prépayés par organisation.
-- Chaque organisation reçoit 300 crédits de bienvenue. Les questions consomment
-- des crédits (moteur réflexe : 1 crédit ; IA générative : coût réel × marge,
-- calculé par l’application). Les packs sont demandés depuis le poste et
-- crédités par l’opérateur après paiement (facturation manuelle du pilote).
CREATE TABLE app.ai_wallets (
  organization_id text PRIMARY KEY REFERENCES public.organizations ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.ai_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  restaurant_id text,
  profile_id text,
  delta integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('welcome','purchase','usage','bonus','refund')),
  engine text,
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 300),
  -- Coût fournisseur réel en micro-euros (IA générative), pour suivre la marge.
  cost_micro_eur integer NOT NULL DEFAULT 0 CHECK (cost_micro_eur >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_ledger_organization ON app.ai_ledger(organization_id, created_at DESC);
CREATE TABLE app.ai_pack_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  profile_id text NOT NULL,
  pack text NOT NULL CHECK (pack ~ '^[a-z]{2,20}$'),
  credits integer NOT NULL CHECK (credits > 0),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app.ai_wallets, app.ai_ledger, app.ai_pack_requests FROM PUBLIC, atacuisine_app;

CREATE FUNCTION app.ai_welcome() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO app.ai_wallets(organization_id,balance) VALUES (NEW.id,300) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO app.ai_ledger(organization_id,delta,kind,detail) VALUES (NEW.id,300,'welcome','Crédits de bienvenue Cuisine IA');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_welcome AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION app.ai_welcome();

INSERT INTO app.ai_wallets(organization_id,balance) SELECT id,300 FROM organizations ON CONFLICT DO NOTHING;
INSERT INTO app.ai_ledger(organization_id,delta,kind,detail)
SELECT id,300,'welcome','Crédits de bienvenue Cuisine IA' FROM organizations;

-- Solde visible par tout membre ayant accès à l’établissement.
CREATE FUNCTION app.ai_wallet(rid text) RETURNS TABLE(organization_id text, balance integer, admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT r.organization_id, coalesce(w.balance,0), app.org_admin(r.organization_id)
  FROM restaurants r LEFT JOIN app.ai_wallets w ON w.organization_id=r.organization_id
  WHERE r.id=rid AND app.has_restaurant(rid)
$$;

-- Débit atomique. partial=true (IA générative, coût connu après coup) plafonne
-- le débit au solde restant au lieu d’échouer.
CREATE FUNCTION app.ai_consume(rid text, amount integer, engine_name text, info text, cost integer, partial boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oid text; current integer; charged integer;
BEGIN
  IF amount < 0 OR amount > 100000 THEN RAISE EXCEPTION 'Montant de crédits invalide.'; END IF;
  IF NOT app.has_restaurant(rid) THEN RAISE EXCEPTION 'Accès non autorisé.'; END IF;
  SELECT r.organization_id INTO STRICT oid FROM restaurants r WHERE r.id=rid;
  INSERT INTO app.ai_wallets(organization_id) VALUES (oid) ON CONFLICT DO NOTHING;
  SELECT balance INTO STRICT current FROM app.ai_wallets WHERE organization_id=oid FOR UPDATE;
  IF current < amount AND NOT partial THEN RAISE EXCEPTION 'Crédits Cuisine IA insuffisants.'; END IF;
  charged := least(amount, current);
  UPDATE app.ai_wallets SET balance=balance-charged, updated_at=now() WHERE organization_id=oid;
  INSERT INTO app.ai_ledger(organization_id,restaurant_id,profile_id,delta,kind,engine,detail,cost_micro_eur)
  VALUES (oid,rid,app.user_id(),-charged,'usage',engine_name,left(coalesce(info,''),300),greatest(coalesce(cost,0),0));
  RETURN current-charged;
END $$;

CREATE FUNCTION app.ai_history(rid text, lim integer DEFAULT 20)
RETURNS TABLE(delta integer, kind text, engine text, detail text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT l.delta,l.kind,l.engine,l.detail,l.created_at FROM app.ai_ledger l
  JOIN restaurants r ON r.organization_id=l.organization_id
  WHERE r.id=rid AND app.has_restaurant(rid)
  ORDER BY l.created_at DESC, l.id DESC LIMIT least(greatest(lim,1),100)
$$;

-- Demande de pack par un administrateur de l’organisation.
CREATE FUNCTION app.ai_request_pack(rid text, pack_name text, pack_credits integer, pack_price integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oid text; request bigint;
BEGIN
  SELECT r.organization_id INTO oid FROM restaurants r WHERE r.id=rid AND app.has_restaurant(rid);
  IF oid IS NULL OR NOT app.org_admin(oid) THEN RAISE EXCEPTION 'Recharge réservée aux administrateurs de l’organisation.'; END IF;
  IF (SELECT count(*) FROM app.ai_pack_requests WHERE organization_id=oid AND status='pending') >= 3 THEN
    RAISE EXCEPTION 'Trois demandes de recharge sont déjà en attente.';
  END IF;
  INSERT INTO app.ai_pack_requests(organization_id,profile_id,pack,credits,price_cents)
  VALUES (oid,app.user_id(),pack_name,pack_credits,pack_price) RETURNING id INTO request;
  RETURN request;
END $$;

CREATE FUNCTION app.ai_pending_packs(rid text)
RETURNS TABLE(id bigint, pack text, credits integer, price_cents integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.id,p.pack,p.credits,p.price_cents,p.created_at FROM app.ai_pack_requests p
  JOIN restaurants r ON r.organization_id=p.organization_id
  WHERE r.id=rid AND app.has_restaurant(rid) AND p.status='pending' ORDER BY p.created_at DESC
$$;

-- Opérateur (connexion de migration) : crédite après paiement.
CREATE FUNCTION app.ai_credit(oid text, credits integer, credit_kind text, info text, request bigint DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE result integer;
BEGIN
  IF credits <= 0 OR credit_kind NOT IN ('purchase','bonus','refund') THEN RAISE EXCEPTION 'Crédit invalide.'; END IF;
  INSERT INTO app.ai_wallets(organization_id) VALUES (oid) ON CONFLICT DO NOTHING;
  UPDATE app.ai_wallets SET balance=balance+credits, updated_at=now() WHERE organization_id=oid RETURNING balance INTO STRICT result;
  INSERT INTO app.ai_ledger(organization_id,delta,kind,detail) VALUES (oid,credits,credit_kind,left(coalesce(info,''),300));
  IF request IS NOT NULL THEN
    UPDATE app.ai_pack_requests SET status='paid' WHERE id=request AND organization_id=oid AND status='pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Demande de recharge introuvable ou déjà traitée.'; END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.ai_credit(text,integer,text,text,bigint) FROM PUBLIC, atacuisine_app;

INSERT INTO schema_versions(version) VALUES (26);
