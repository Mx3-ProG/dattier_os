DROP TABLE onboarding_drafts;
CREATE OR REPLACE FUNCTION app.module_enabled(rid text, module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT module IN ('floor','table-booking')
    AND app.addon_installed(rid,CASE WHEN module='table-booking' THEN 'booking' ELSE 'floor' END)
    AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
      AND s.module_id=module AND s.applied_state='suspended')
    AND (module<>'table-booking' OR app.addon_installed(rid,'floor')
      AND NOT EXISTS (SELECT 1 FROM module_settings s WHERE s.restaurant_id=rid
        AND s.module_id='floor' AND s.applied_state='suspended'))
$$;
DROP INDEX organizations_creation_key;
ALTER TABLE restaurants DROP COLUMN work_profile, DROP COLUMN trade_detail, DROP COLUMN trade, DROP COLUMN industry;
ALTER TABLE organizations DROP COLUMN onboarding_answers, DROP COLUMN discovery_detail, DROP COLUMN discovery_source,
  DROP COLUMN first_restaurant_id, DROP COLUMN creation_key, DROP COLUMN created_by;
ALTER TABLE profiles DROP COLUMN work_phone, DROP COLUMN job_title;
DELETE FROM schema_versions WHERE version=78;
