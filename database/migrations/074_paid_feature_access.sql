-- Defense in depth: direct SQL access follows the same establishment licence as the API.
ALTER POLICY tenant_access ON public.time_entries
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'attendance'))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'attendance'));
ALTER POLICY hr_read ON public.hr_absences USING (app.hr_access(restaurant_id) AND app.addon_installed(restaurant_id,'attendance'));
ALTER POLICY hr_write ON public.hr_absences WITH CHECK (app.hr_access(restaurant_id) AND app.addon_installed(restaurant_id,'attendance'));
ALTER POLICY hr_update ON public.hr_absences
  USING (app.hr_access(restaurant_id) AND app.addon_installed(restaurant_id,'attendance'))
  WITH CHECK (app.hr_access(restaurant_id) AND app.addon_installed(restaurant_id,'attendance'));
ALTER POLICY hr_read ON public.hr_contracts USING (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'));
ALTER POLICY hr_write ON public.hr_contracts WITH CHECK (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'));
ALTER POLICY hr_update ON public.hr_contracts
  USING (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'))
  WITH CHECK (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'));
ALTER POLICY hr_read ON public.hr_payroll_periods USING (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'));
ALTER POLICY hr_write ON public.hr_payroll_periods WITH CHECK (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'));
ALTER POLICY hr_update ON public.hr_payroll_periods
  USING (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'))
  WITH CHECK (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,'payroll'));

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['fin_company','fin_invoice_sequences','fin_invoices','fin_invoice_payments'] LOOP
    EXECUTE format('ALTER POLICY fin_read ON public.%I USING (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,''client-invoices''))',tab);
    EXECUTE format('ALTER POLICY fin_write ON public.%I WITH CHECK (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,''client-invoices''))',tab);
    EXECUTE format('ALTER POLICY fin_update ON public.%I USING (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,''client-invoices'')) WITH CHECK (app.fin_access(restaurant_id) AND app.addon_installed(restaurant_id,''client-invoices''))',tab);
  END LOOP;
END $$;

ALTER POLICY tenant_access ON public.integration_connections
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'connections'))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'connections'));
ALTER POLICY conflict_decisions_scope ON public.offline_conflict_decisions
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'offline-conflicts'))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'offline-conflicts'));
ALTER POLICY tenant_access ON public.qr_codes
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'qr'))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'qr'));
ALTER POLICY tenant_access ON public.qr_scans
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'qr'))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'qr'));
CREATE OR REPLACE FUNCTION app.scan_qr(t text, uid text)
RETURNS TABLE (restaurant_id text, kind text, ref text, target text, archived boolean, staff boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q qr_codes; member boolean := false;
BEGIN
  SELECT * INTO q FROM qr_codes c WHERE c.token=t;
  IF NOT FOUND OR NOT (app.addon_installed(q.restaurant_id,'qr')
    OR (q.kind='clock' AND app.addon_installed(q.restaurant_id,'attendance'))) THEN RETURN; END IF;
  IF uid IS NOT NULL THEN
    member := EXISTS (
      SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.profile_id
      WHERE m.profile_id=uid AND m.restaurant_id=q.restaurant_id AND p.status='active'
    ) OR EXISTS (
      SELECT 1 FROM restaurants r JOIN organization_memberships om ON om.organization_id=r.organization_id
      JOIN profiles p ON p.id=om.profile_id
      WHERE r.id=q.restaurant_id AND om.profile_id=uid AND om.role IN ('OWNER','ADMIN') AND p.status='active'
    );
  END IF;
  INSERT INTO qr_scans(id,qr_id,restaurant_id,audience)
  VALUES(gen_random_uuid()::text,q.id,q.restaurant_id,CASE WHEN member THEN 'staff' ELSE 'public' END);
  RETURN QUERY SELECT q.restaurant_id,q.kind,q.ref,q.target,q.archived_at IS NOT NULL,member;
END $$;
ALTER POLICY tenant_access ON public.loyalty_rewards
  USING (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'loyalty'))
  WITH CHECK (app.in_restaurant(restaurant_id) AND app.addon_installed(restaurant_id,'loyalty'));
ALTER POLICY tenant_access ON public.loyalty_transactions
  USING (app.in_restaurant((SELECT restaurant_id FROM customers WHERE id=customer_id))
    AND app.addon_installed((SELECT restaurant_id FROM customers WHERE id=customer_id),'loyalty'))
  WITH CHECK (app.in_restaurant((SELECT restaurant_id FROM customers WHERE id=customer_id))
    AND app.addon_installed((SELECT restaurant_id FROM customers WHERE id=customer_id),'loyalty'));
INSERT INTO schema_versions(version) VALUES(74);
