-- Attribution automatique des nouvelles demandes au sein du module Pipeline CRM.
ALTER TABLE public.crm_automation_settings
  ADD COLUMN inquiry_assignment_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN inquiry_assignee_id text REFERENCES public.profiles(id),
  ADD CONSTRAINT crm_inquiry_assignment_choice CHECK (NOT inquiry_assignment_enabled OR inquiry_assignee_id IS NOT NULL);

CREATE FUNCTION app.crm_assign_new_inquiry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    SELECT s.inquiry_assignee_id INTO NEW.assigned_to
    FROM public.crm_automation_settings s
    JOIN public.memberships m ON m.restaurant_id=s.restaurant_id AND m.profile_id=s.inquiry_assignee_id
    JOIN public.profiles p ON p.id=m.profile_id AND p.status='active'
    WHERE s.restaurant_id=NEW.restaurant_id AND s.inquiry_assignment_enabled
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.crm_assign_new_inquiry() FROM PUBLIC;
CREATE TRIGGER crm_assign_new_inquiry BEFORE INSERT ON public.crm_inquiries
FOR EACH ROW EXECUTE FUNCTION app.crm_assign_new_inquiry();
INSERT INTO schema_versions(version) VALUES(149);
