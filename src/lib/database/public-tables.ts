/**
 * Tables accessibles au canal public (visiteur anonyme, webhook) dans le contexte de
 * leur propre restaurant. Toute autre table est refusée par une politique RESTRICTIVE
 * (migration 060). Ajouter ici une table impose une migration, et le test compare les deux.
 * Voir docs/platform/TENANT_ISOLATION.md.
 */
export const PUBLIC_ROOT_TABLES = new Set([
  "restaurants",
  "organizations",
  "profiles",
  "schema_versions",
]);
export const PUBLIC_TABLES = new Set([
  // Carte, stock et commande
  "menu_items",
  "recipe_ingredients",
  "option_recipes",
  "ingredients",
  "stock_lots",
  "stock_movements",
  "stock_reservations",
  "orders",
  "order_items",
  "table_sessions",
  "dining_tables",
  "floor_zones",
  "floor_layout_access",
  "shop_settings",
  "shop_orders",
  "payment_declarations",
  "online_payments",
  "connect_accounts",
  // Promotions, avis et fidélité
  "promo_codes",
  "promo_redemptions",
  "flash_promotions",
  "product_reviews",
  "loyalty_rewards",
  "loyalty_settings",
  "loyalty_transactions",
  "organization_loyalty_transactions",
  "loyalty_wallets",
  // Compte client et réservation
  "customers",
  "organization_customers",
  "customer_sessions",
  "customer_access_tokens",
  "customer_email_outbox",
  "customer_password_resets",
  "customer_badges",
  "customer_referral_codes",
  "customer_referrals",
  "reservations",
  // QR et site publié
  "qr_codes",
  "qr_scans",
  "restaurant_cms",
  "cms_versions",
  "cms_media",
  "site_documents",
  "site_publications",
  "site_assets",
  "restaurant_domains",
]);
/** Le canal public peut écrire ces journaux et files, jamais les relire. */
export const PUBLIC_INSERT_ONLY_TABLES = new Set([
  "notifications",
  "domain_events",
  "restaurant_events",
  "audit_logs",
  "ops_security_events",
  "security_events",
]);
