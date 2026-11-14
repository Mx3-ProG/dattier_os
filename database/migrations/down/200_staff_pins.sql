-- Retire les codes PIN, la visibilité par membre et le journal du personnel.
DROP FUNCTION IF EXISTS app.record_pin_attempt(text,text,boolean);
DROP FUNCTION IF EXISTS app.accepted_invitation_restaurant(text);
DROP TABLE IF EXISTS staff_activity;
DROP TABLE IF EXISTS member_visibility;
DROP TABLE IF EXISTS staff_pins;
ALTER TABLE restaurants DROP COLUMN IF EXISTS staff_pin_required;
DELETE FROM schema_versions WHERE version=200;
