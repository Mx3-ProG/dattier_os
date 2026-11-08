-- Retour arrière de 036, réservé à la préproduction : détruit toutes les écritures.
-- Les corrections de données du lot 0 (remises, statut des commandes réglées) sont conservées.
DROP TRIGGER payment_financial_event ON payment_declarations;
DROP TRIGGER payment_append_only ON payment_declarations;
DROP FUNCTION app.fin_verify_chain(text);
DROP FUNCTION app.fin_reverse_entry(text,text,text);
DROP FUNCTION app.fin_open_review(text,text,text,text);
DROP FUNCTION app.fin_post_entry(text,text,text,jsonb);
DROP FUNCTION app.fin_insert_entry(text,text,text,date,text,text,jsonb);
DROP FUNCTION app.fin_freeze_order_vat(text,boolean);
DROP FUNCTION app.fin_capture_payment();
ALTER TABLE order_items DROP COLUMN vat_rate_id, DROP COLUMN vat_rate_bp;
DROP TABLE fin_review_items;
DROP TABLE fin_entry_lines;
DROP TABLE fin_entries;
DROP TABLE fin_counters;
DROP TABLE fin_events;
DROP TABLE fin_product_vat;
DROP TABLE fin_tax_rates;
DROP TABLE fin_accounts;
DROP TABLE fin_settings;
DROP FUNCTION app.fin_check_balance();
DROP FUNCTION app.fin_access(text);
DROP FUNCTION app.fin_member(text);
DROP FUNCTION app.fin_owner_session();
DELETE FROM schema_versions WHERE version=36;
