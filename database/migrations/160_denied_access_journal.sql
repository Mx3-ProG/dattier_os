-- Journal des tentatives refusées venant de l'extérieur d'un établissement.
-- L'intrus n'a pas le droit d'écrire dans le journal de sa cible : sans cette fonction,
-- la RLS refuse l'événement et le propriétaire ne voit rien.
-- Voir docs/platform/TENANT_ISOLATION.md.

-- État interne, hors du schéma public : aucun rôle applicatif n'y a accès, seule la fonction y écrit.
-- Une seule fenêtre est conservée par établissement, et le nombre de sources y est plafonné.
CREATE TABLE app.denied_access_counters (
  restaurant_id text NOT NULL,
  source text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts>0),
  PRIMARY KEY(restaurant_id,source)
);
ALTER TABLE app.denied_access_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.denied_access_counters FROM PUBLIC;

-- Retour : 'not_applicable' si l'appelant a le droit d'écrire lui-même ou n'est pas connecté
-- (l'application passe alors par le journal normal), sinon 'logged' ou 'counted'.
-- Tout le contenu de la ligne est fixé ici : l'appelant ne fournit aucun texte libre.
CREATE FUNCTION app.record_denied_access(target text,route text,client_ref text,correlation text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  max_sources constant integer:=20;   -- sources suivies par établissement et par heure
  detailed constant integer:=3;       -- tentatives détaillées par source et par heure
  uid text:=coalesce(app.user_id(),'');
  current_window timestamptz:=date_trunc('hour',now());
  source_ref text;
  tracked integer;
  n integer;
BEGIN
  IF uid='' OR app.has_restaurant(target) THEN RETURN 'not_applicable'; END IF;
  -- Le journal n'a pas de clé étrangère : sans ce contrôle, n'importe quel identifiant créerait des lignes.
  IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=target) THEN RETURN 'counted'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('denied_access:'||target,0));
  DELETE FROM app.denied_access_counters WHERE restaurant_id=target AND window_start<current_window;

  -- Empreinte propre à la cible : le propriétaire peut regrouper les tentatives sans connaître
  -- le compte ni le relier à une tentative chez un autre client.
  source_ref:=left(encode(sha256(convert_to(target||':'||uid,'UTF8')),'hex'),16);
  IF NOT EXISTS(SELECT 1 FROM app.denied_access_counters WHERE restaurant_id=target AND source=source_ref) THEN
    SELECT count(*) INTO tracked FROM app.denied_access_counters WHERE restaurant_id=target AND source<>'*';
    IF tracked>=max_sources THEN source_ref:='*'; END IF;
  END IF;
  INSERT INTO app.denied_access_counters AS c(restaurant_id,source,window_start,attempts)
    VALUES(target,source_ref,current_window,1)
    ON CONFLICT(restaurant_id,source) DO UPDATE SET attempts=c.attempts+1
    RETURNING attempts INTO n;

  -- Au-delà des premières tentatives, seuls les paliers 10, 100, 1000... produisent une ligne :
  -- le journal garde le volume réel sans pouvoir être rempli.
  IF n>detailed AND n::text !~ '^10+$' THEN RETURN 'counted'; END IF;

  INSERT INTO ops_security_events(event_id,severity,event_type,module,action,restaurant_id,correlation_id,status,error_code,message,technical_details)
  VALUES(
    gen_random_uuid()::text,4,'access.denied.external','security',
    CASE WHEN route ~ '^/[A-Za-z0-9_./\[\]-]{1,119}$' THEN route ELSE 'Route inconnue' END,
    target,
    CASE WHEN correlation ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN correlation END,
    'failure','ACCESS_DENIED_EXTERNAL',
    CASE WHEN n>detailed
      THEN format('%s tentatives d’accès depuis un compte extérieur à cet établissement depuis le début de l’heure. Toutes ont été refusées.',n)
      ELSE 'Un compte extérieur à cet établissement a tenté d’y accéder. La demande a été refusée.' END,
    jsonb_build_object(
      'source',source_ref,
      'occurrences',n,
      'client',CASE WHEN client_ref ~ '^[a-f0-9]{8,32}$' THEN client_ref END
    )
  );
  RETURN 'logged';
END $$;
REVOKE ALL ON FUNCTION app.record_denied_access(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_denied_access(text,text,text,text) TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(160) ON CONFLICT DO NOTHING;
