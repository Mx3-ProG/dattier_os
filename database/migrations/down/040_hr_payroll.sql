-- Retour arrière de 040, réservé à la préproduction. Refusé dès qu’une donnée RH existe :
-- supprimer une correction de pointage ferait réapparaître des heures fausses.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM hr_contracts) OR EXISTS(SELECT 1 FROM hr_absences) OR EXISTS(SELECT 1 FROM hr_payroll_periods)
     OR EXISTS(SELECT 1 FROM time_entries WHERE source<>'clock' OR voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Retour arrière refusé : des données RH existent.';
  END IF;
END $$;
DROP TABLE hr_payroll_periods;
DROP TABLE hr_absences;
DROP TABLE hr_contracts;
DROP TABLE hr_settings;
DROP FUNCTION app.hr_access(text);
DROP INDEX time_entries_scope;
ALTER TABLE time_entries DROP COLUMN source, DROP COLUMN corrected_by, DROP COLUMN reason, DROP COLUMN voided_at, DROP COLUMN voided_by, DROP COLUMN void_reason;
DELETE FROM schema_versions WHERE version=40;
