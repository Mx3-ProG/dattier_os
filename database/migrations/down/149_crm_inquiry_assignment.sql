DROP TRIGGER IF EXISTS crm_assign_new_inquiry ON public.crm_inquiries;
DROP FUNCTION IF EXISTS app.crm_assign_new_inquiry();
ALTER TABLE public.crm_automation_settings
  DROP CONSTRAINT IF EXISTS crm_inquiry_assignment_choice,
  DROP COLUMN IF EXISTS inquiry_assignee_id,
  DROP COLUMN IF EXISTS inquiry_assignment_enabled;
DELETE FROM schema_versions WHERE version=149;
