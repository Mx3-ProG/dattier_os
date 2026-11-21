CREATE TABLE IF NOT EXISTS profile_two_factor(
  profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_otp_enabled boolean NOT NULL DEFAULT false,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  backup_codes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_two_factor_challenges(
  id text PRIMARY KEY,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_two_factor_challenges_profile ON auth_two_factor_challenges(profile_id, created_at);
ALTER TABLE profile_two_factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_two_factor_challenges ENABLE ROW LEVEL SECURITY;
