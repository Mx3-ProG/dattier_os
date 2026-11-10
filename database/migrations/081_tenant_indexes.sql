-- Index de périmètre locataire et de clés étrangères chaudes.
-- Purement additif : aucune donnée, politique RLS ou fonction n'est modifiée.
--
-- Contexte (audit du 10 novembre 2026, schéma 001→080 appliqué sur une base vierge) :
-- 148 tables sous RLS, mais 26 tables portant restaurant_id n'avaient aucun index
-- commençant par cette colonne. Les politiques RLS et les services filtrent tous par
-- établissement : sans index, chaque lecture d'un établissement parcourt la table de
-- tous les établissements, et le coût croît avec le nombre de clients de la plateforme.
-- Voir docs/platform/CORE-ET-MODULES.md, section « Indexation ».
--
-- Exploitation : CREATE INDEX verrouille les écritures de la table le temps de la
-- construction. Les volumes actuels le permettent dans la transaction de migration.
-- Sur une base volumineuse, créer d'abord ces index avec CREATE INDEX CONCURRENTLY
-- (hors transaction) sous les mêmes noms : IF NOT EXISTS rend alors cette migration neutre.

-- 1. Périmètre établissement.
CREATE INDEX IF NOT EXISTS customer_referral_codes_tenant ON customer_referral_codes(restaurant_id);
CREATE INDEX IF NOT EXISTS customer_referrals_tenant ON customer_referrals(restaurant_id);
CREATE INDEX IF NOT EXISTS customers_tenant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS expenses_tenant ON expenses(restaurant_id);
CREATE INDEX IF NOT EXISTS fin_entry_lines_tenant ON fin_entry_lines(restaurant_id);
CREATE INDEX IF NOT EXISTS fin_invoice_payments_tenant ON fin_invoice_payments(restaurant_id);
CREATE INDEX IF NOT EXISTS inventory_sessions_tenant ON inventory_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS invitations_tenant ON invitations(restaurant_id);
CREATE INDEX IF NOT EXISTS memberships_tenant ON memberships(restaurant_id);
CREATE INDEX IF NOT EXISTS menu_items_tenant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS notifications_tenant ON notifications(restaurant_id);
CREATE INDEX IF NOT EXISTS offline_conflict_decisions_tenant ON offline_conflict_decisions(restaurant_id);
CREATE INDEX IF NOT EXISTS offline_devices_tenant ON offline_devices(restaurant_id);
CREATE INDEX IF NOT EXISTS ops_security_jobs_tenant ON ops_security_jobs(restaurant_id);
CREATE INDEX IF NOT EXISTS ops_security_remediations_tenant ON ops_security_remediations(restaurant_id);
CREATE INDEX IF NOT EXISTS organization_loyalty_transactions_tenant ON organization_loyalty_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS purchase_documents_tenant ON purchase_documents(restaurant_id);
CREATE INDEX IF NOT EXISTS purchase_orders_tenant ON purchase_orders(restaurant_id);
CREATE INDEX IF NOT EXISTS qr_scans_tenant ON qr_scans(restaurant_id);
CREATE INDEX IF NOT EXISTS shifts_tenant ON shifts(restaurant_id);
CREATE INDEX IF NOT EXISTS site_assets_tenant ON site_assets(restaurant_id);
CREATE INDEX IF NOT EXISTS stock_movements_tenant ON stock_movements(restaurant_id);
CREATE INDEX IF NOT EXISTS studio_credit_orders_tenant ON studio_credit_orders(restaurant_id);
CREATE INDEX IF NOT EXISTS supplier_ingredients_tenant ON supplier_ingredients(restaurant_id);
CREATE INDEX IF NOT EXISTS suppliers_tenant ON suppliers(restaurant_id);
CREATE INDEX IF NOT EXISTS support_grants_tenant ON support_grants(restaurant_id);

-- 2. Clés étrangères parcourues par les jointures, les triggers de contrôle ou les
--    suppressions en cascade (sinon parcours complet de la table enfant).
CREATE INDEX IF NOT EXISTS orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS order_items_menu ON order_items(menu_id);
CREATE INDEX IF NOT EXISTS stock_movements_lot ON stock_movements(lot_id);
CREATE INDEX IF NOT EXISTS stock_reservations_item ON stock_reservations(item_id);
CREATE INDEX IF NOT EXISTS stock_reservations_lot ON stock_reservations(lot_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS option_recipes_ingredient ON option_recipes(ingredient_id);
CREATE INDEX IF NOT EXISTS purchase_document_lines_document ON purchase_document_lines(document_id);
CREATE INDEX IF NOT EXISTS receipts_purchase ON receipts(purchase_id);
CREATE INDEX IF NOT EXISTS offline_operations_device ON offline_operations(device_id);
CREATE INDEX IF NOT EXISTS offline_quotas_device ON offline_quotas(device_id);
CREATE INDEX IF NOT EXISTS trade_records_tool ON trade_records(tool_id);

-- 3. Identité : établissements et sessions d'une personne (connexion, révocation).
CREATE INDEX IF NOT EXISTS sessions_profile ON sessions(profile_id);
CREATE INDEX IF NOT EXISTS organization_memberships_profile ON organization_memberships(profile_id);
CREATE INDEX IF NOT EXISTS invitations_organization ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS support_grants_profile ON support_grants(profile_id);
CREATE INDEX IF NOT EXISTS shifts_profile ON shifts(profile_id);
CREATE INDEX IF NOT EXISTS time_entries_profile ON time_entries(profile_id);

INSERT INTO schema_versions(version) VALUES(81);
