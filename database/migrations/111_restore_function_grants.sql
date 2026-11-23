-- Supabase initialization revoked EXECUTE from PUBLIC on every existing function.
-- Functions that never had an explicit grant (they relied on the PUBLIC default)
-- became unusable by the application roles, e.g. app.restaurant_plan, which broke
-- the account home for every user. Restores exactly the rights a fresh install
-- gives these roles, granted explicitly to them only (never back to PUBLIC,
-- anon or authenticated). Idempotent and harmless where rights already exist.

GRANT EXECUTE ON FUNCTION app.addon_session(order_id text, session_id text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.addon_session(order_id text, session_id text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.addon_store_manager(rid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.addon_store_manager(rid text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ai_consume(rid text, amount integer, engine_name text, info text, cost integer, partial boolean) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.ai_consume(rid text, amount integer, engine_name text, info text, cost integer, partial boolean) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ai_history(rid text, lim integer) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.ai_history(rid text, lim integer) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ai_pending_packs(rid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.ai_pending_packs(rid text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ai_request_pack(rid text, pack_name text, pack_credits integer, pack_price integer) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.ai_request_pack(rid text, pack_name text, pack_credits integer, pack_price integer) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ai_wallet(rid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.ai_wallet(rid text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.ai_welcome() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.ai_welcome() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.attach_referral(oid text, referral text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.attach_referral(oid text, referral text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.audit_security() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.check_account_scope() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.check_module_new_work() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.check_module_new_work() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.check_offline_tenant_reference() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.check_offline_tenant_reference() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.check_reservation_table() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.check_reservation_table() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.check_restaurant_seat() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.check_restaurant_seat() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.effective_plan(paid integer, bonus integer) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.effective_plan(paid integer, bonus integer) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.fin_bank_tx_guard() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.fin_bank_tx_guard() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.fin_check_balance() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.fin_check_balance() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.fin_invoice_guard() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.fin_invoice_guard() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.fin_invoice_lines_guard() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.fin_invoice_lines_guard() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.has_addon(rid text, addon_id text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.has_addon(rid text, addon_id text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.immutable_event() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.init_organization_plan() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.init_organization_plan() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.lock_restaurant_for_order(rid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.lock_restaurant_for_order(rid text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.module_enabled(rid text, module text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.module_enabled(rid text, module text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.organization_plan(oid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.protect_restaurant_archive() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.protect_restaurant_archive() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.referral_bonus_plan(paying integer) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.referral_bonus_plan(paying integer) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.referral_invitation(referral text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.referral_invitation(referral text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.referral_leaderboard(oid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.referral_plan_changed() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.referral_plan_changed() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.referral_summary(oid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.restaurant_plan(rid text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.restaurant_plan(rid text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.reward_plan_allowed(reward_token text) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.reward_plan_allowed(reward_token text) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.seo_on_change() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.seo_on_change() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.seo_on_restaurant() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.seo_on_restaurant() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.set_referral_visibility(oid text, visible boolean) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.set_referral_visibility(oid text, visible boolean) TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.setup_cms() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.setup_operations_security() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.setup_operations_security() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.table_quota(p integer) TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.trade_records_immutable() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.trade_records_immutable() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION app.trade_records_quota() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION app.trade_records_quota() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION public.ops_security_append_only() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION public.ops_security_append_only() TO atacuisine_app;
GRANT EXECUTE ON FUNCTION public.ops_security_event_stamp() TO atacuisine_addon_billing;
GRANT EXECUTE ON FUNCTION public.ops_security_event_stamp() TO atacuisine_app;

INSERT INTO schema_versions(version) VALUES(111) ON CONFLICT DO NOTHING;
