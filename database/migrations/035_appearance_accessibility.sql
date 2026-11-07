ALTER TABLE profile_appearance ADD COLUMN text_size text NOT NULL DEFAULT 'standard' CHECK(text_size IN ('standard','large','extraLarge'));
ALTER TABLE profile_appearance ADD COLUMN category_colors jsonb NOT NULL DEFAULT '{"pilotage":"#52617c","operations":"#2563b8","management":"#087e83","team":"#7950b5","finance":"#9a6418","customers":"#b73578","configuration":"#526447"}'::jsonb CHECK(jsonb_typeof(category_colors)='object');
INSERT INTO schema_versions(version) VALUES(35);
