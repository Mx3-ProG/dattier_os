-- Première tranche CRM : demandes entrantes attribuables à une entreprise et à un client.
CREATE UNIQUE INDEX IF NOT EXISTS customers_restaurant_id_id ON public.customers(restaurant_id,id);
ALTER TABLE public.crm_opportunities ADD COLUMN customer_id text;
ALTER TABLE public.crm_opportunities ADD CONSTRAINT crm_opportunities_customer_scope FOREIGN KEY (restaurant_id,customer_id) REFERENCES public.customers(restaurant_id,id);
ALTER TABLE public.crm_opportunities ADD COLUMN proposal_status text NOT NULL DEFAULT 'draft' CHECK (proposal_status IN ('draft','sent','accepted','declined'));
ALTER TABLE public.crm_opportunities ADD COLUMN proposal_sent_at timestamptz;
ALTER TABLE public.crm_opportunities ADD COLUMN follow_up_at timestamptz;
ALTER TABLE public.crm_opportunities ADD COLUMN proposal_description text NOT NULL DEFAULT '' CHECK (length(proposal_description)<=300);
ALTER TABLE public.crm_opportunities ADD COLUMN valid_until date;
CREATE FUNCTION app.crm_proposal_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.proposal_status <> 'draft' AND
    (NEW.title,NEW.amount_cents,NEW.proposal_description,NEW.valid_until,NEW.company_id,NEW.customer_id)
    IS DISTINCT FROM
    (OLD.title,OLD.amount_cents,OLD.proposal_description,OLD.valid_until,OLD.company_id,OLD.customer_id)
  THEN RAISE EXCEPTION 'Une proposition envoyée ou clôturée ne peut plus être modifiée.'; END IF;
  IF OLD.proposal_status IN ('accepted','declined') AND NEW.proposal_status<>OLD.proposal_status
  THEN RAISE EXCEPTION 'Une proposition clôturée ne peut plus changer de statut.'; END IF;
  IF OLD.proposal_status='sent' AND NEW.proposal_status='draft'
  THEN RAISE EXCEPTION 'Une proposition envoyée ne peut pas redevenir un brouillon.'; END IF;
  IF OLD.proposal_status='draft' AND NEW.proposal_status='sent' AND NOT EXISTS
    (SELECT 1 FROM public.crm_proposal_deliveries d WHERE d.restaurant_id=OLD.restaurant_id AND d.opportunity_id=OLD.id)
  THEN RAISE EXCEPTION 'Un envoi confirmé est requis avant le statut envoyé.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_proposal_guard BEFORE UPDATE ON public.crm_opportunities
FOR EACH ROW EXECUTE FUNCTION app.crm_proposal_guard();
CREATE TABLE public.crm_inquiries (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  company_id text,
  customer_id text,
  opportunity_id text,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 180),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  sender_name text CHECK (sender_name IS NULL OR length(sender_name) BETWEEN 1 AND 180),
  sender_email text CHECK (sender_email IS NULL OR length(sender_email) BETWEEN 3 AND 320),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','website','email','phone','other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  assigned_to text REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id,id),
  FOREIGN KEY (restaurant_id,company_id) REFERENCES public.crm_companies(restaurant_id,id),
  FOREIGN KEY (restaurant_id,customer_id) REFERENCES public.customers(restaurant_id,id),
  FOREIGN KEY (restaurant_id,opportunity_id) REFERENCES public.crm_opportunities(restaurant_id,id)
);
CREATE INDEX crm_inquiries_restaurant ON public.crm_inquiries(restaurant_id,status,updated_at DESC);
CREATE INDEX crm_inquiries_company ON public.crm_inquiries(restaurant_id,company_id,created_at DESC);
CREATE INDEX crm_inquiries_sender_rate ON public.crm_inquiries(restaurant_id,sender_email,created_at DESC) WHERE sender_email IS NOT NULL;
ALTER TABLE public.crm_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pilotage_scope ON public.crm_inquiries FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_inquiries FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.crm_inquiries TO atacuisine_app;
CREATE TABLE public.crm_proposal_deliveries (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  opportunity_id text NOT NULL,
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 3 AND 320),
  provider_id text,
  sent_by text NOT NULL REFERENCES public.profiles(id),
  sent_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id,opportunity_id) REFERENCES public.crm_opportunities(restaurant_id,id)
);
CREATE INDEX crm_proposal_deliveries_opportunity ON public.crm_proposal_deliveries(restaurant_id,opportunity_id,sent_at DESC);
ALTER TABLE public.crm_proposal_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pilotage_scope ON public.crm_proposal_deliveries FOR ALL TO atacuisine_app
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true')
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'pipeline-crm') AND current_setting('app.public',true) IS DISTINCT FROM 'true');
REVOKE ALL ON public.crm_proposal_deliveries FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.crm_proposal_deliveries TO atacuisine_app;
CREATE FUNCTION app.crm_public_inquiry(rid text, sender text, email text, subject text, message text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE matched_customer text;
BEGIN
  IF current_setting('app.public',true) IS DISTINCT FROM 'true' OR NOT app.in_restaurant(rid)
    OR NOT app.addon_installed(rid,'website') OR NOT app.addon_installed(rid,'pipeline-crm')
    OR NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id=rid AND archived_at IS NULL)
  THEN RAISE EXCEPTION 'Formulaire indisponible.'; END IF;
  IF length(btrim(sender)) NOT BETWEEN 1 AND 180 OR length(btrim(email)) NOT BETWEEN 3 AND 320
    OR length(btrim(subject)) NOT BETWEEN 1 AND 180 OR length(btrim(message)) NOT BETWEEN 1 AND 5000
  THEN RAISE EXCEPTION 'Demande invalide.'; END IF;
  IF EXISTS (SELECT 1 FROM public.crm_inquiries WHERE restaurant_id=rid AND sender_email=lower(btrim(email)) AND created_at>now()-interval '2 minutes')
  THEN RAISE EXCEPTION 'Veuillez patienter avant de renvoyer une demande.'; END IF;
  SELECT CASE WHEN count(*)=1 THEN min(id) END INTO matched_customer
    FROM public.customers WHERE restaurant_id=rid AND lower(btrim(contact))=lower(btrim(email));
  INSERT INTO public.crm_inquiries(id,restaurant_id,customer_id,subject,body,source,sender_name,sender_email)
  VALUES (gen_random_uuid()::text,rid,matched_customer,btrim(subject),btrim(message),'website',btrim(sender),lower(btrim(email)));
END $$;
REVOKE ALL ON FUNCTION app.crm_public_inquiry(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.crm_public_inquiry(text,text,text,text,text) TO atacuisine_app;
INSERT INTO schema_versions(version) VALUES(141);
