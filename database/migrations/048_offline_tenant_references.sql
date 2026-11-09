-- Cross-table references must belong to the same establishment as the device.
CREATE FUNCTION app.check_offline_tenant_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE device_restaurant text;
DECLARE target_restaurant text;
BEGIN
  IF TG_TABLE_NAME='offline_quotas' THEN
    SELECT restaurant_id INTO device_restaurant FROM offline_devices WHERE id=NEW.device_id;
    SELECT restaurant_id INTO target_restaurant FROM menu_items WHERE id=NEW.menu_id;
  ELSIF TG_TABLE_NAME='offline_allocations' THEN
    SELECT d.restaurant_id INTO device_restaurant FROM offline_quotas q
      JOIN offline_devices d ON d.id=q.device_id WHERE q.id=NEW.quota_id;
    SELECT i.restaurant_id INTO target_restaurant FROM stock_lots l
      JOIN ingredients i ON i.id=l.ingredient_id WHERE l.id=NEW.lot_id;
  ELSIF TG_TABLE_NAME='offline_operations' THEN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    SELECT restaurant_id INTO device_restaurant FROM offline_devices WHERE id=NEW.device_id;
    SELECT restaurant_id INTO target_restaurant FROM orders WHERE id=NEW.order_id;
  ELSIF TG_TABLE_NAME='offline_conflict_decisions' THEN
    device_restaurant := NEW.restaurant_id;
    SELECT d.restaurant_id INTO target_restaurant FROM offline_operations o
      JOIN offline_devices d ON d.id=o.device_id WHERE o.id=NEW.operation_id;
  END IF;
  IF device_restaurant IS NULL OR target_restaurant IS NULL OR device_restaurant<>target_restaurant THEN
    RAISE EXCEPTION 'Référence hors ligne d’un autre établissement.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offline_quota_tenant BEFORE INSERT OR UPDATE OF device_id,menu_id ON offline_quotas
FOR EACH ROW EXECUTE FUNCTION app.check_offline_tenant_reference();
CREATE TRIGGER offline_allocation_tenant BEFORE INSERT OR UPDATE OF quota_id,lot_id ON offline_allocations
FOR EACH ROW EXECUTE FUNCTION app.check_offline_tenant_reference();
CREATE TRIGGER offline_operation_tenant BEFORE INSERT OR UPDATE OF device_id,order_id ON offline_operations
FOR EACH ROW EXECUTE FUNCTION app.check_offline_tenant_reference();
CREATE TRIGGER offline_decision_tenant BEFORE INSERT OR UPDATE OF restaurant_id,operation_id ON offline_conflict_decisions
FOR EACH ROW EXECUTE FUNCTION app.check_offline_tenant_reference();
INSERT INTO schema_versions(version) VALUES(48);
