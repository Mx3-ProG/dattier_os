-- Repairs French text that was double-encoded when the migrations were pasted
-- into the Supabase SQL editor: UTF-8 bytes were read as Windows-1252, so
-- "Ecrans" with an accent became "A-tilde + per-mille sign", an apostrophe
-- became "a-circumflex + euro + trademark", and so on.
--
-- This file is ASCII only on purpose: every special character is built with
-- chr(), so the script cannot itself be damaged by the same copy and paste.
--
-- Repaired: table data (public and app), function bodies, column defaults and
-- trigger arguments. Only mis-encoded sequences are rewritten; correct text is
-- left untouched, so the script is idempotent and harmless on a clean database.

CREATE OR REPLACE FUNCTION pg_temp.repair_text(s text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  -- Windows-1252 characters for bytes 0x80-0x9F, and those bytes as chr().
  cp text := chr(8364)||chr(8218)||chr(402)||chr(8222)||chr(8230)||chr(8224)||chr(8225)
    ||chr(710)||chr(8240)||chr(352)||chr(8249)||chr(338)||chr(381)||chr(8216)||chr(8217)
    ||chr(8220)||chr(8221)||chr(8226)||chr(8211)||chr(8212)||chr(732)||chr(8482)||chr(353)
    ||chr(8250)||chr(339)||chr(382)||chr(376);
  lo text := chr(128)||chr(130)||chr(131)||chr(132)||chr(133)||chr(134)||chr(135)
    ||chr(136)||chr(137)||chr(138)||chr(139)||chr(140)||chr(142)||chr(145)||chr(146)
    ||chr(147)||chr(148)||chr(149)||chr(150)||chr(151)||chr(152)||chr(153)||chr(154)
    ||chr(155)||chr(156)||chr(158)||chr(159);
  c text;
  pat text;
  src text;
  done text;
  m text[];
  pos integer;
  dec text;
  pass integer := 0;
  b integer[];
  k integer;
  ch text;
  code integer;
BEGIN
  IF s IS NULL OR s !~ ('[' || chr(194) || '-' || chr(244) || ']') THEN
    RETURN s;
  END IF;
  -- A UTF-8 continuation byte, as it appears once misread.
  c := '[' || chr(128) || '-' || chr(191) || cp || ']';
  pat := '([' || chr(240) || '-' || chr(244) || ']' || c || '{3}|['
    || chr(224) || '-' || chr(239) || ']' || c || '{2}|['
    || chr(194) || '-' || chr(223) || ']' || c || ')';
  LOOP
    pass := pass + 1;
    src := s;
    done := '';
    LOOP
      m := regexp_match(src, pat);
      EXIT WHEN m IS NULL;
      pos := strpos(src, m[1]);
      -- Back to the original bytes, then decode them as UTF-8 by hand
      -- (no encoding conversion needed, works on every PostgreSQL build).
      b := '{}';
      FOR k IN 1 .. length(m[1]) LOOP
        ch := substr(m[1], k, 1);
        IF strpos(cp, ch) > 0 THEN
          b := b || ascii(substr(lo, strpos(cp, ch), 1));
        ELSE
          b := b || ascii(ch);
        END IF;
      END LOOP;
      code := NULL;
      IF array_length(b, 1) = 2 THEN
        code := ((b[1] & 31) << 6) | (b[2] & 63);
        IF code < 128 THEN code := NULL; END IF;
      ELSIF array_length(b, 1) = 3 THEN
        code := ((b[1] & 15) << 12) | ((b[2] & 63) << 6) | (b[3] & 63);
        IF code < 2048 OR code BETWEEN 55296 AND 57343 THEN code := NULL; END IF;
      ELSE
        code := ((b[1] & 7) << 18) | ((b[2] & 63) << 12) | ((b[3] & 63) << 6) | (b[4] & 63);
        IF code < 65536 OR code > 1114111 THEN code := NULL; END IF;
      END IF;
      dec := coalesce(chr(code), m[1]);
      done := done || left(src, pos - 1) || dec;
      src := substr(src, pos + length(m[1]));
    END LOOP;
    done := done || src;
    EXIT WHEN done = s OR pass >= 3;
    s := done;
  END LOOP;
  -- The non-breaking space of a-grave or of French punctuation may have been
  -- turned into a plain space by the editor: A-tilde or A-circumflex followed
  -- by a space never occurs in correct French.
  s := replace(s, chr(195) || ' ', chr(224));
  s := replace(s, chr(194) || ' ', chr(160));
  RETURN s;
END
$fn$;

DO $repair$
DECLARE
  hint text := '[' || chr(194) || '-' || chr(244) || ']';
  r record;
  t record;
  expr text;
  n bigint;
  total bigint := 0;
  funcs integer := 0;
  def text;
  fixed text;
  replica boolean := true;
  disabled text[];
BEGIN
  -- Skip triggers (audit, immutability, updated_at) while rewriting text.
  BEGIN
    SET LOCAL session_replication_role = replica;
  EXCEPTION WHEN OTHERS THEN
    replica := false;
  END;

  FOR t IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'app')
    ORDER BY n.nspname, c.relname
  LOOP
    disabled := NULL;
    FOR r IN
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS typ
      FROM pg_attribute a
      WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attgenerated = ''
        AND a.atttypid IN ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype,
          'json'::regtype, 'jsonb'::regtype, 'text[]'::regtype, 'varchar[]'::regtype)
    LOOP
      expr := format('pg_temp.repair_text(%I::text)::%s', r.attname, r.typ);
      IF NOT replica AND disabled IS NULL THEN
        SELECT coalesce(array_agg(tgname), '{}') INTO disabled
        FROM pg_trigger WHERE tgrelid = t.oid AND NOT tgisinternal AND tgenabled <> 'D';
        FOREACH def IN ARRAY disabled LOOP
          EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I', t.nspname, t.relname, def);
        END LOOP;
      END IF;
      BEGIN
        EXECUTE format('UPDATE %I.%I SET %I = %s WHERE %I::text ~ %L AND %s IS DISTINCT FROM %I',
          t.nspname, t.relname, r.attname, expr, r.attname, hint, expr, r.attname);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Non repare %.%.% : %', t.nspname, t.relname, r.attname, SQLERRM;
      END;
    END LOOP;
    IF disabled IS NOT NULL THEN
      FOREACH def IN ARRAY disabled LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER %I', t.nspname, t.relname, def);
      END LOOP;
    END IF;
  END LOOP;

  -- Function bodies (error messages, labels written by the functions).
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace IN ('public'::regnamespace, 'app'::regnamespace)
      AND p.prokind IN ('f', 'p') AND p.prosrc ~ hint
  LOOP
    def := pg_get_functiondef(r.oid);
    fixed := pg_temp.repair_text(def);
    IF fixed IS DISTINCT FROM def THEN
      BEGIN
        EXECUTE fixed;
        funcs := funcs + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Fonction non reparee % : %', r.oid::regprocedure, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Column defaults.
  FOR r IN
    SELECT n.nspname, c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid) AS expr
    FROM pg_attrdef d
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE n.nspname IN ('public', 'app') AND a.attgenerated = ''
  LOOP
    fixed := pg_temp.repair_text(r.expr);
    IF fixed IS DISTINCT FROM r.expr THEN
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s',
        r.nspname, r.relname, r.attname, fixed);
    END IF;
  END LOOP;

  -- Trigger arguments.
  FOR r IN
    SELECT tg.tgname, n.nspname, c.relname, pg_get_triggerdef(tg.oid) AS def, tg.tgenabled
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'app') AND NOT tg.tgisinternal
  LOOP
    fixed := pg_temp.repair_text(r.def);
    IF fixed IS DISTINCT FROM r.def THEN
      EXECUTE format('DROP TRIGGER %I ON %I.%I', r.tgname, r.nspname, r.relname);
      EXECUTE fixed;
      IF r.tgenabled = 'D' THEN
        EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I', r.nspname, r.relname, r.tgname);
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Encodage repare : % valeur(s), % fonction(s)', total, funcs;
END
$repair$;

DROP FUNCTION pg_temp.repair_text(text);

-- Les migrations suivantes de la même transaction ont besoin des déclencheurs.
SET LOCAL session_replication_role = origin;

INSERT INTO schema_versions(version) VALUES(130) ON CONFLICT DO NOTHING;
