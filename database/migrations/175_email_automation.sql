-- Add-on « Emails automatiques » (9 € TTC par mois, identifiant `email-automation`).
--
-- Trois briques séparées, chacune avec ses tables, toutes isolées par établissement :
-- - personnalisation : identité visuelle (email_brands) et modèles (email_templates) ;
-- - configuration SMTP : transport de l'établissement (email_transports), secret chiffré ;
-- - moteur d'envoi : file des messages (email_messages), réclamée et soldée par fonctions.
--
-- Le contenu n'est rendu qu'au moment de l'envoi : un déclencheur (réservation, test,
-- campagne) n'enregistre que la clé du modèle et ses variables.
-- Idempotent : plusieurs sessions de développement partagent la même base de démonstration.

-- 1. Droit commercial ---------------------------------------------------------------
ALTER TABLE public.addon_subscriptions DROP CONSTRAINT IF EXISTS addon_subscriptions_addon_check;
ALTER TABLE public.addon_subscriptions ADD CONSTRAINT addon_subscriptions_addon_check
  CHECK (addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain','prospect-scanner','pipeline-crm','customer-health','email-automation'));

-- La démonstration présente l'add-on par les droits de l'établissement, sans paiement simulé.
ALTER TABLE public.addon_legacy_grants DROP CONSTRAINT IF EXISTS addon_legacy_grants_addon_id_check;
ALTER TABLE public.addon_legacy_grants ADD CONSTRAINT addon_legacy_grants_addon_id_check
  CHECK (addon_id IN ('invoices','attendance','client-invoices','payroll',
    'offline-conflicts','connections','qr','loyalty','domain',
    'prospect-scanner','pipeline-crm','customer-health','email-automation'));

CREATE OR REPLACE FUNCTION app.paid_addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT addon IN ('invoices','attendance','client-invoices','payroll','offline-conflicts','connections','qr','loyalty','domain','prospect-scanner','pipeline-crm','customer-health','email-automation')
    AND coalesce(app.restaurant_plan(rid),0)>=39 AND (
      EXISTS (SELECT 1 FROM addon_legacy_grants g WHERE g.restaurant_id=rid AND g.addon_id=addon)
      OR EXISTS (SELECT 1 FROM addon_subscriptions s WHERE s.restaurant_id=rid AND s.addon=addon
        AND s.status='active' AND s.valid_until>now())
    )
$$;

CREATE OR REPLACE FUNCTION app.addon_entitled(rid text, addon text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE addon
    WHEN 'floor' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'booking' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'website' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'online-orders' THEN coalesce(app.restaurant_plan(rid),0)>=39
    WHEN 'loyalty' THEN app.paid_addon_entitled(rid,'loyalty')
    WHEN 'invoices' THEN app.paid_addon_entitled(rid,'invoices')
    WHEN 'attendance' THEN app.paid_addon_entitled(rid,'attendance')
    WHEN 'client-invoices' THEN app.paid_addon_entitled(rid,'client-invoices')
    WHEN 'payroll' THEN app.paid_addon_entitled(rid,'payroll')
    WHEN 'offline-conflicts' THEN app.paid_addon_entitled(rid,'offline-conflicts')
    WHEN 'connections' THEN app.paid_addon_entitled(rid,'connections')
    WHEN 'qr' THEN app.paid_addon_entitled(rid,'qr')
    WHEN 'domain' THEN app.paid_addon_entitled(rid,'domain')
    WHEN 'prospect-scanner' THEN app.paid_addon_entitled(rid,'prospect-scanner')
    WHEN 'pipeline-crm' THEN app.paid_addon_entitled(rid,'pipeline-crm')
    WHEN 'customer-health' THEN app.paid_addon_entitled(rid,'customer-health')
    WHEN 'email-automation' THEN app.paid_addon_entitled(rid,'email-automation')
    ELSE EXISTS (SELECT 1 FROM addon_licenses l WHERE l.restaurant_id=rid AND l.product_id=addon
      AND l.status='active' AND (l.valid_until IS NULL OR l.valid_until>now()))
  END
$$;

CREATE OR REPLACE FUNCTION app.module_displayable(module text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT module IN (
    'orders','table-booking','catalog','stock','trade-tools','website','floor','kitchen','bar',
    'recipes','suppliers','deliveries','attendance','payroll','accounting','expenses',
    'client-invoices','invoices','loyalty','qr','analytics','estimation','prospect-scanner',
    'pipeline-crm','customer-health','services','products','email-automation'
  )
$$;

-- Même décision que 150, avec le module `email-automation`.
CREATE OR REPLACE FUNCTION app.module_available(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH b AS (
    SELECT r.industry='restaurant' AS food,
      coalesce(app.restaurant_plan(r.id),0)>=39 AS studio
    FROM restaurants r
    WHERE r.id=rid
      AND (app.has_restaurant(rid) OR (session_user=current_user AND current_setting('role')='none'))
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM b) THEN
      CASE WHEN module IN (
        'overview','activity','orders','table-booking','catalog','stock','trade-tools','team',
        'finance','bank','payouts','settings','security','website','online-orders','domain',
        'floor','kitchen','bar','recipes','suppliers','deliveries','attendance','payroll',
        'accounting','expenses','client-invoices','invoices','loyalty','qr','analytics',
        'estimation','prospect-scanner','pipeline-crm','customer-health','offline-conflicts','connections','ai-assistant','ai-invoice-extraction',
        'services','products','email-automation'
      ) THEN false END
    ELSE (SELECT CASE module
      -- Toujours présents
      WHEN 'activity' THEN true
      WHEN 'team' THEN true
      WHEN 'settings' THEN true
      WHEN 'security' THEN true
      WHEN 'ai-assistant' THEN true
      WHEN 'services' THEN true
      WHEN 'products' THEN true
      -- Secteur restauration, ou affichage demandé par le commerce
      WHEN 'orders' THEN b.food OR app.module_shown(rid,'orders')
      WHEN 'catalog' THEN b.food OR app.module_shown(rid,'catalog')
      WHEN 'stock' THEN b.food OR app.module_shown(rid,'stock')
      WHEN 'kitchen' THEN b.food OR app.module_shown(rid,'kitchen')
      WHEN 'bar' THEN b.food OR app.module_shown(rid,'bar')
      WHEN 'recipes' THEN b.food OR app.module_shown(rid,'recipes')
      WHEN 'suppliers' THEN b.food OR app.module_shown(rid,'suppliers')
      WHEN 'deliveries' THEN b.food OR app.module_shown(rid,'deliveries')
      -- Abonnement Studio actif
      WHEN 'overview' THEN b.studio
      WHEN 'finance' THEN b.studio
      WHEN 'bank' THEN b.studio
      WHEN 'payouts' THEN b.studio
      WHEN 'accounting' THEN b.studio
      WHEN 'expenses' THEN b.studio
      -- Modules suspendables (installation, suspension, secteur ou affichage)
      WHEN 'floor' THEN app.module_enabled(rid,'floor')
      WHEN 'table-booking' THEN app.module_enabled(rid,'table-booking')
      -- Add-ons : droit commercial et installation
      WHEN 'website' THEN app.addon_installed(rid,'website')
      WHEN 'online-orders' THEN app.addon_installed(rid,'online-orders')
      WHEN 'domain' THEN app.addon_installed(rid,'domain')
      WHEN 'attendance' THEN app.addon_installed(rid,'attendance')
      WHEN 'payroll' THEN app.addon_installed(rid,'payroll')
      WHEN 'client-invoices' THEN app.addon_installed(rid,'client-invoices')
      WHEN 'invoices' THEN app.addon_installed(rid,'invoices')
      WHEN 'ai-invoice-extraction' THEN app.addon_installed(rid,'invoices')
      WHEN 'loyalty' THEN app.addon_installed(rid,'loyalty')
      WHEN 'offline-conflicts' THEN app.addon_installed(rid,'offline-conflicts')
      WHEN 'connections' THEN app.addon_installed(rid,'connections')
      WHEN 'qr' THEN (b.food OR app.module_shown(rid,'qr')) AND app.addon_installed(rid,'qr')
      WHEN 'email-automation' THEN app.addon_installed(rid,'email-automation')
      -- Licences de la boutique d'add-ons
      WHEN 'analytics' THEN app.addon_installed(rid,'earth-tracker-3d')
      WHEN 'estimation' THEN app.addon_installed(rid,'estimation-studio')
      WHEN 'prospect-scanner' THEN app.addon_installed(rid,'prospect-scanner')
      WHEN 'pipeline-crm' THEN app.addon_installed(rid,'pipeline-crm')
      WHEN 'customer-health' THEN app.addon_installed(rid,'customer-health')
      WHEN 'trade-tools' THEN EXISTS (
        SELECT 1 FROM addon_licenses l JOIN addon_products p ON p.id=l.product_id
        WHERE l.restaurant_id=rid AND p.kind='business' AND app.addon_installed(rid,l.product_id))
    END FROM b)
  END
$$;

-- 2. Personnalisation : identité visuelle et modèles ---------------------------------
CREATE TABLE IF NOT EXISTS public.email_brands (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- Document validé par l'application (src/features/email/branding/brand.ts).
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings)='object' AND length(settings::text)<=8000),
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- Déclencheur (`reservation.requested`…) ou modèle libre (`custom-…`).
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9.-]{1,63}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('transactional','marketing')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND length(content::text)<=20000),
  -- Automatisation active : le déclencheur envoie ce modèle sans intervention.
  enabled boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, key)
);

-- 3. Configuration SMTP ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_transports (
  restaurant_id text PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- platform : le SMTP de la plateforme (celui branché sur Supabase Auth) ;
  -- custom : le serveur SMTP propre à l'établissement.
  mode text NOT NULL DEFAULT 'platform' CHECK (mode IN ('platform','custom')),
  host text CHECK (host IS NULL OR host ~ '^[A-Za-z0-9.-]{1,253}$'),
  port integer CHECK (port IS NULL OR port IN (25,465,587,2525)),
  security text CHECK (security IS NULL OR security IN ('tls','starttls')),
  username text CHECK (username IS NULL OR length(username)<=254),
  -- Chiffré par l'application (AES-256-GCM, lié à l'établissement). Jamais relu par l'écran.
  secret text CHECK (secret IS NULL OR length(secret)<=2000),
  from_email text CHECK (from_email IS NULL OR length(from_email)<=254),
  from_name text CHECK (from_name IS NULL OR length(from_name)<=120),
  verified_at timestamptz,
  last_error text,
  updated_by text REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mode='platform' OR (host IS NOT NULL AND port IS NOT NULL AND security IS NOT NULL AND from_email IS NOT NULL))
);

-- 4. Moteur d'envoi -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_messages (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin IN ('automation','manual','test')),
  template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9.-]{1,63}$'),
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 3 AND 254),
  customer_id text,
  -- Variables du modèle et, pour un envoi manuel, le contenu modifié à la main.
  vars jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(vars)='object' AND length(vars::text)<=20000),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','demo','error','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  -- Rendu figé au moment de l'envoi (historique fidèle de ce qui est parti).
  subject text,
  html text,
  transport text CHECK (transport IS NULL OR transport IN ('platform','custom')),
  provider_id text,
  error text,
  actor text REFERENCES public.profiles(id),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_messages_restaurant ON public.email_messages(restaurant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS email_messages_queue ON public.email_messages(restaurant_id,status,created_at) WHERE status IN ('queued','sending');

-- 5. Droits : établissement ouvert, add-on installé, jamais le canal public ----------
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['email_brands','email_templates','email_transports','email_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('DROP POLICY IF EXISTS email_scope ON public.%I',tab);
    EXECUTE format('CREATE POLICY email_scope ON public.%I FOR ALL TO atacuisine_app USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,''email-automation'') AND current_setting(''app.public'',true) IS DISTINCT FROM ''true'') WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,''email-automation'') AND current_setting(''app.public'',true) IS DISTINCT FROM ''true'')',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,atacuisine_app',tab);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public.email_brands TO atacuisine_app;
GRANT SELECT,INSERT,UPDATE ON public.email_templates TO atacuisine_app;
-- Le secret SMTP n'est lisible que par la fonction de livraison.
GRANT SELECT (restaurant_id,mode,host,port,security,username,from_email,from_name,verified_at,last_error,updated_by,updated_at)
  ON public.email_transports TO atacuisine_app;
GRANT INSERT,UPDATE ON public.email_transports TO atacuisine_app;
-- Les statuts d'envoi ne changent que par app.email_claim / app.email_complete.
GRANT SELECT,INSERT ON public.email_messages TO atacuisine_app;

-- 6. Fonctions du moteur ------------------------------------------------------------
-- Déclencheur automatique, appelable depuis n'importe quel module, y compris le canal
-- public (demande de réservation). Ne lève jamais d'erreur : un email ne doit pas faire
-- échouer l'opération métier qui le déclenche. Retourne l'identifiant du message ou NULL.
CREATE OR REPLACE FUNCTION app.email_trigger(rid text, trigger_key text, to_address text, customer text, payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE message_id text; ref text:=coalesce(payload->>'ref','');
BEGIN
  IF rid IS NULL OR NOT app.in_restaurant(rid) OR NOT app.addon_installed(rid,'email-automation') THEN RETURN NULL; END IF;
  IF to_address IS NULL OR to_address !~ '^[^@\s<>",;]{1,64}@[^@\s<>",;]{1,190}\.[A-Za-z]{2,24}$' THEN RETURN NULL; END IF;
  IF trigger_key !~ '^[a-z][a-z0-9.-]{1,63}$' OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR length(payload::text)>20000 THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM email_templates t WHERE t.restaurant_id=rid AND t.key=trigger_key
      AND t.enabled AND t.archived_at IS NULL) THEN RETURN NULL; END IF;
  -- Même déclencheur, même destinataire, même objet métier : un seul envoi par heure.
  IF EXISTS (SELECT 1 FROM email_messages m WHERE m.restaurant_id=rid AND m.template_key=trigger_key
      AND lower(m.recipient)=lower(to_address) AND coalesce(m.vars->>'ref','')=ref
      AND m.created_at>now()-interval '1 hour') THEN RETURN NULL; END IF;
  -- Plafond quotidien par établissement : protège le SMTP partagé et la réputation d'envoi.
  IF (SELECT count(*) FROM email_messages m WHERE m.restaurant_id=rid AND m.created_at>now()-interval '1 day')>=1000 THEN RETURN NULL; END IF;
  message_id:=gen_random_uuid()::text;
  INSERT INTO email_messages(id,restaurant_id,origin,template_key,recipient,customer_id,vars)
    VALUES(message_id,rid,'automation',trigger_key,lower(to_address),customer,payload);
  PERFORM app.enqueue_job(gen_random_uuid()::text,rid,'email_send',jsonb_build_object('message',message_id),message_id);
  RETURN message_id;
END $$;

-- Réserve les messages à envoyer (statut « sending »). Un message bloqué plus de
-- 5 minutes (processus interrompu) redevient réclamable, au plus 3 tentatives.
CREATE OR REPLACE FUNCTION app.email_claim(rid text, only_id text DEFAULT NULL, max_count integer DEFAULT 10)
RETURNS TABLE(id text, origin text, template_key text, recipient text, vars jsonb, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT app.in_restaurant(rid) THEN RAISE EXCEPTION 'Établissement non autorisé.'; END IF;
  IF NOT app.addon_installed(rid,'email-automation') THEN
    UPDATE email_messages m SET status='skipped',error='Add-on Emails automatiques inactif.'
      WHERE m.restaurant_id=rid AND m.status='queued' AND (only_id IS NULL OR m.id=only_id);
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE email_messages m SET status='sending',attempts=m.attempts+1,claimed_at=now()
  WHERE m.id IN (
    SELECT q.id FROM email_messages q
    WHERE q.restaurant_id=rid AND (only_id IS NULL OR q.id=only_id) AND q.attempts<3
      AND (q.status='queued' OR (q.status='sending' AND q.claimed_at<now()-interval '5 minutes'))
    ORDER BY q.created_at LIMIT greatest(1,least(max_count,50))
    FOR UPDATE SKIP LOCKED)
  RETURNING m.id,m.origin,m.template_key,m.recipient,m.vars,m.attempts;
END $$;

-- Contexte de livraison : identité, modèles actifs, transport (secret chiffré compris).
CREATE OR REPLACE FUNCTION app.email_delivery_context(rid text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT app.in_restaurant(rid) OR NOT app.addon_installed(rid,'email-automation') THEN
    RAISE EXCEPTION 'Établissement non autorisé.';
  END IF;
  RETURN jsonb_build_object(
    'restaurant',(SELECT jsonb_build_object('name',r.name) FROM restaurants r WHERE r.id=rid),
    'brand',(SELECT b.settings FROM email_brands b WHERE b.restaurant_id=rid),
    'templates',coalesce((SELECT jsonb_object_agg(t.key,jsonb_build_object('name',t.name,'category',t.category,'content',t.content))
      FROM email_templates t WHERE t.restaurant_id=rid AND t.archived_at IS NULL),'{}'::jsonb),
    'transport',(SELECT to_jsonb(x) FROM (SELECT mode,host,port,security,username,secret,from_email,from_name
      FROM email_transports WHERE restaurant_id=rid) x));
END $$;

-- Solde un message réclamé. Une erreur passagère le remet en file tant qu'il reste des tentatives.
CREATE OR REPLACE FUNCTION app.email_complete(rid text, message_id text, outcome text, rendered_subject text,
  rendered_html text, used_transport text, provider text, failure text, retry boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT app.in_restaurant(rid) THEN RAISE EXCEPTION 'Établissement non autorisé.'; END IF;
  IF outcome NOT IN ('sent','demo','error','skipped') THEN RAISE EXCEPTION 'Statut d’envoi inconnu.'; END IF;
  UPDATE email_messages m SET
    status=CASE WHEN outcome='error' AND retry AND m.attempts<3 THEN 'queued' ELSE outcome END,
    subject=left(rendered_subject,300),html=left(rendered_html,200000),transport=used_transport,
    provider_id=left(provider,200),error=left(failure,300),
    sent_at=CASE WHEN outcome IN ('sent','demo') THEN now() END,claimed_at=NULL
  WHERE m.id=message_id AND m.restaurant_id=rid AND m.status='sending';
  IF used_transport='custom' AND outcome IN ('sent','error') THEN
    UPDATE email_transports SET verified_at=CASE WHEN outcome='sent' THEN now() ELSE verified_at END,
      last_error=CASE WHEN outcome='sent' THEN NULL ELSE left(failure,300) END
    WHERE restaurant_id=rid AND mode='custom';
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.email_trigger(text,text,text,text,jsonb),app.email_claim(text,text,integer),
  app.email_delivery_context(text),app.email_complete(text,text,text,text,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.email_trigger(text,text,text,text,jsonb),app.email_claim(text,text,integer),
  app.email_delivery_context(text),app.email_complete(text,text,text,text,text,text,text,text,boolean) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(175) ON CONFLICT DO NOTHING;
