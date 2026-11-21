-- RLS sur les tables 2FA (défense en profondeur, isolation par profil).
ALTER TABLE profile_two_factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_two_factor_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_two_factor_self ON profile_two_factor;
CREATE POLICY profile_two_factor_self ON profile_two_factor
  FOR ALL TO atacuisine_app
  USING (profile_id = app.user_id())
  WITH CHECK (profile_id = app.user_id());

DROP POLICY IF EXISTS auth_two_factor_challenges_self ON auth_two_factor_challenges;
CREATE POLICY auth_two_factor_challenges_self ON auth_two_factor_challenges
  FOR ALL TO atacuisine_app
  USING (profile_id = app.user_id())
  WITH CHECK (profile_id = app.user_id());

-- Le rôle worker n'a pas besoin d'accéder à ces tables. Pas de policy pour lui.