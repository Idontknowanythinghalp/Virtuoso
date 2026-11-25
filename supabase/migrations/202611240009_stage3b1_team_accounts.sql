-- Stage 3B.1 Migration 0009: Team Account Database Foundation & Concurrent Session Control
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser, is_active_super_admin)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (contingents)
-- Additive only. Does NOT modify Stage 1, 2A, 2B, 2C, or 3A policies, tables, or organiser roles.
-- Does NOT add team login UI or expose competition tables to teams (deferred to later Stage 3B phases).

-- Ownership & privilege requirements (must be satisfied by the migration runner, e.g. postgres):
--   - Functions marked SECURITY DEFINER run as their owner and require that owner to have:
--       1. SELECT on auth.sessions (id, user_id, not_after)
--       2. EXECUTE on auth.uid() and auth.jwt()
--       3. SELECT, INSERT, UPDATE on public.team_accounts, public.team_sessions,
--          public.profiles, public.contingents, and public.audit_logs
--   - Every SECURITY DEFINER function sets search_path with pg_temp placed last and
--     schema-qualifies object references to prevent object-shadowing attacks.

-- ============================================================================
-- 1. TIMESTAMP HELPER & TEAM_ACCOUNTS TABLE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_team_account_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_account_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.team_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contingent_id uuid NOT NULL REFERENCES public.contingents (id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  updated_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  deactivated_at timestamptz NULL,
  deactivated_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Exactly one team account per contingent
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_accounts_contingent_unique'
      AND conrelid = 'public.team_accounts'::regclass
  ) THEN
    ALTER TABLE public.team_accounts
      ADD CONSTRAINT team_accounts_contingent_unique
      UNIQUE (contingent_id);
  END IF;

  -- One Auth user maps to at most one team account
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_accounts_auth_user_unique'
      AND conrelid = 'public.team_accounts'::regclass
  ) THEN
    ALTER TABLE public.team_accounts
      ADD CONSTRAINT team_accounts_auth_user_unique
      UNIQUE (auth_user_id);
  END IF;

  -- Composite unique key so team_sessions can enforce matching (team_account_id, contingent_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_accounts_id_contingent_unique'
      AND conrelid = 'public.team_accounts'::regclass
  ) THEN
    ALTER TABLE public.team_accounts
      ADD CONSTRAINT team_accounts_id_contingent_unique
      UNIQUE (id, contingent_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_accounts_deactivation_consistency_check'
      AND conrelid = 'public.team_accounts'::regclass
  ) THEN
    ALTER TABLE public.team_accounts
      ADD CONSTRAINT team_accounts_deactivation_consistency_check
      CHECK (
        (is_active = true AND deactivated_at IS NULL AND deactivated_by IS NULL)
        OR (is_active = false AND deactivated_at IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS team_accounts_active_contingent_idx
  ON public.team_accounts (is_active, contingent_id);

DROP TRIGGER IF EXISTS set_team_accounts_updated_at ON public.team_accounts;
CREATE TRIGGER set_team_accounts_updated_at
  BEFORE UPDATE ON public.team_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_team_account_updated_at();

-- ============================================================================
-- 2. RACE-SAFE ORGANISER/TEAM SEPARATION & ACCOUNT DEACTIVATION REVOCATION
-- ============================================================================
-- Both enforce_team_account_integrity() and enforce_profile_team_separation()
-- acquire the same transaction-scoped advisory lock keyed by the Auth user UUID
-- BEFORE checking the opposite table, preventing concurrent creation bypasses.
CREATE OR REPLACE FUNCTION public.enforce_team_account_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Team account auth_user_id cannot be null';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
       OR NEW.contingent_id <> OLD.contingent_id
       OR NEW.auth_user_id <> OLD.auth_user_id
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Team account identity, contingent linkage, auth_user_id, and created_at are immutable';
    END IF;

    IF OLD.is_active IS TRUE AND NEW.is_active IS FALSE THEN
      NEW.deactivated_at := COALESCE(NEW.deactivated_at, pg_catalog.clock_timestamp());
    ELSIF OLD.is_active IS FALSE AND NEW.is_active IS TRUE THEN
      NEW.deactivated_at := NULL;
      NEW.deactivated_by := NULL;
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_auth_identity_role:' || NEW.auth_user_id::text)
  );

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = NEW.auth_user_id
  ) THEN
    RAISE EXCEPTION 'Team accounts must remain separate from organiser profiles';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_team_account_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_team_account_integrity ON public.team_accounts;
CREATE TRIGGER protect_team_account_integrity
  BEFORE INSERT OR UPDATE ON public.team_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_team_account_integrity();

CREATE OR REPLACE FUNCTION public.enforce_profile_team_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Profile id cannot be null';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_auth_identity_role:' || NEW.id::text)
  );

  IF EXISTS (
    SELECT 1
    FROM public.team_accounts ta
    WHERE ta.auth_user_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Auth user is linked to a team account and cannot hold an organiser profile';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_team_separation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_team_separation ON public.profiles;
CREATE TRIGGER protect_profile_team_separation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_team_separation();

-- Atomically revoke every currently unrevoked session when a team account transitions
-- from active to inactive. Runs AFTER UPDATE so the team_accounts row lock is already
-- held before acquiring virtuoso_team_session:<team_account_id>, matching the exact
-- lock order used by register_team_session() and revoke_current_team_session().
-- Reactivating the account (false -> true) does not trigger and never restores revoked sessions.
CREATE OR REPLACE FUNCTION public.revoke_team_sessions_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_revoked_count integer := 0;
  v_actor_email text := NULL;
BEGIN
  IF OLD.is_active IS TRUE AND NEW.is_active IS FALSE THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('virtuoso_team_session:' || NEW.id::text)
    );

    v_now := pg_catalog.clock_timestamp();

    UPDATE public.team_sessions ts
    SET
      revoked_at = GREATEST(ts.created_at, v_now),
      revoked_reason = 'account_deactivated',
      revoked_by = NEW.deactivated_by
    WHERE ts.team_account_id = NEW.id
      AND ts.revoked_at IS NULL;

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    IF v_revoked_count > 0 THEN
      IF NEW.deactivated_by IS NOT NULL THEN
        SELECT p.email
        INTO v_actor_email
        FROM public.profiles p
        WHERE p.id = NEW.deactivated_by;
      END IF;

      INSERT INTO public.audit_logs (
        actor_user_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        after_data,
        metadata
      )
      VALUES (
        NEW.deactivated_by,
        v_actor_email,
        'team_session.account_deactivated',
        'team_account',
        NEW.id::text,
        jsonb_build_object(
          'revoked_session_count', v_revoked_count,
          'revoked_reason', 'account_deactivated'
        ),
        jsonb_build_object(
          'team_account_id', NEW.id,
          'contingent_id', NEW.contingent_id,
          'timestamp', v_now
        )
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_team_sessions_on_deactivation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS revoke_sessions_on_team_account_deactivation ON public.team_accounts;
CREATE TRIGGER revoke_sessions_on_team_account_deactivation
  AFTER UPDATE OF is_active ON public.team_accounts
  FOR EACH ROW
  WHEN (OLD.is_active IS TRUE AND NEW.is_active IS FALSE)
  EXECUTE FUNCTION public.revoke_team_sessions_on_deactivation();

-- Atomically revoke every currently unrevoked session belonging to a contingent's
-- team account (if one exists) when the contingent transitions from active to inactive.
-- Canonical global lock order:
--   1. public.contingents row lock (already held by this UPDATE)
--   2. public.team_accounts row lock (FOR UPDATE)
--   3. virtuoso_team_session:<team_account_id> advisory lock
--   4. public.team_sessions row updates
-- Reactivating the contingent (false -> true) does not trigger and never restores revoked sessions.
CREATE OR REPLACE FUNCTION public.revoke_team_sessions_on_contingent_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_team public.team_accounts%ROWTYPE;
  v_now timestamptz;
  v_revoked_count integer := 0;
  v_actor_id uuid := NULL;
  v_actor_email text := NULL;
BEGIN
  IF OLD.is_active IS TRUE AND NEW.is_active IS FALSE THEN
    SELECT *
    INTO v_team
    FROM public.team_accounts ta
    WHERE ta.contingent_id = NEW.id
    FOR UPDATE;

    -- Safely exit if the contingent does not have a provisioned team account
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('virtuoso_team_session:' || v_team.id::text)
    );

    v_now := pg_catalog.clock_timestamp();

    v_actor_id := auth.uid();
    IF v_actor_id IS NOT NULL THEN
      SELECT p.email
      INTO v_actor_email
      FROM public.profiles p
      WHERE p.id = v_actor_id;

      IF NOT FOUND THEN
        v_actor_id := NULL;
        v_actor_email := NULL;
      END IF;
    END IF;

    UPDATE public.team_sessions ts
    SET
      revoked_at = GREATEST(ts.created_at, v_now),
      revoked_reason = 'contingent_deactivated',
      revoked_by = v_actor_id
    WHERE ts.team_account_id = v_team.id
      AND ts.revoked_at IS NULL;

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    IF v_revoked_count > 0 THEN
      INSERT INTO public.audit_logs (
        actor_user_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        after_data,
        metadata
      )
      VALUES (
        v_actor_id,
        v_actor_email,
        'team_session.contingent_deactivated',
        'contingent',
        NEW.id::text,
        jsonb_build_object(
          'revoked_session_count', v_revoked_count,
          'revoked_reason', 'contingent_deactivated'
        ),
        jsonb_build_object(
          'team_account_id', v_team.id,
          'contingent_id', NEW.id,
          'contingent_code', NEW.contingent_code,
          'timestamp', v_now
        )
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_team_sessions_on_contingent_deactivation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS revoke_sessions_on_contingent_deactivation ON public.contingents;
CREATE TRIGGER revoke_sessions_on_contingent_deactivation
  AFTER UPDATE OF is_active ON public.contingents
  FOR EACH ROW
  WHEN (OLD.is_active IS TRUE AND NEW.is_active IS FALSE)
  EXECUTE FUNCTION public.revoke_team_sessions_on_contingent_deactivation();

-- ============================================================================
-- 3. TEAM SESSIONS TABLE (MAX 4 CONCURRENT SESSIONS PER TEAM ACCOUNT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.team_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_account_id uuid NOT NULL,
  contingent_id uuid NOT NULL,
  supabase_session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_reason text NULL,
  revoked_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  CONSTRAINT team_sessions_account_contingent_fkey
    FOREIGN KEY (team_account_id, contingent_id)
    REFERENCES public.team_accounts (id, contingent_id)
    ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_sessions_supabase_session_unique'
      AND conrelid = 'public.team_sessions'::regclass
  ) THEN
    ALTER TABLE public.team_sessions
      ADD CONSTRAINT team_sessions_supabase_session_unique
      UNIQUE (supabase_session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_sessions_last_seen_after_created_check'
      AND conrelid = 'public.team_sessions'::regclass
  ) THEN
    ALTER TABLE public.team_sessions
      ADD CONSTRAINT team_sessions_last_seen_after_created_check
      CHECK (last_seen_at >= created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_sessions_revoked_after_created_check'
      AND conrelid = 'public.team_sessions'::regclass
  ) THEN
    ALTER TABLE public.team_sessions
      ADD CONSTRAINT team_sessions_revoked_after_created_check
      CHECK (revoked_at IS NULL OR revoked_at >= created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_sessions_revoked_reason_check'
      AND conrelid = 'public.team_sessions'::regclass
  ) THEN
    ALTER TABLE public.team_sessions
      ADD CONSTRAINT team_sessions_revoked_reason_check
      CHECK (
        revoked_reason IS NULL
        OR revoked_reason IN (
          'logout',
          'organiser_revoked',
          'account_deactivated',
          'contingent_deactivated',
          'auth_session_expired'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_sessions_revocation_consistency_check'
      AND conrelid = 'public.team_sessions'::regclass
  ) THEN
    ALTER TABLE public.team_sessions
      ADD CONSTRAINT team_sessions_revocation_consistency_check
      CHECK (
        (revoked_at IS NULL AND revoked_reason IS NULL AND revoked_by IS NULL)
        OR (
          revoked_at IS NOT NULL
          AND revoked_reason IS NOT NULL
          AND (
            (revoked_reason IN ('logout', 'auth_session_expired') AND revoked_by IS NULL)
            OR (revoked_reason = 'organiser_revoked' AND revoked_by IS NOT NULL)
            OR (revoked_reason IN ('account_deactivated', 'contingent_deactivated'))
          )
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS team_sessions_active_team_idx
  ON public.team_sessions (team_account_id, created_at ASC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS team_sessions_contingent_idx
  ON public.team_sessions (contingent_id);

CREATE INDEX IF NOT EXISTS team_sessions_team_history_idx
  ON public.team_sessions (team_account_id, created_at DESC);

-- Prevent deletion, identity mutation, or un-revocation of team session rows
CREATE OR REPLACE FUNCTION public.enforce_team_session_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Team session records are immutable and cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id
       OR NEW.team_account_id <> OLD.team_account_id
       OR NEW.contingent_id <> OLD.contingent_id
       OR NEW.supabase_session_id <> OLD.supabase_session_id
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Team session identity and linkage fields are immutable';
    END IF;

    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Revoked team sessions are immutable and cannot be modified or reactivated';
    END IF;

    IF NEW.revoked_at IS NOT NULL AND NEW.revoked_reason IS NULL THEN
      RAISE EXCEPTION 'Revoking a team session requires a valid revoked_reason';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_team_session_immutability() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_team_session_immutability ON public.team_sessions;
CREATE TRIGGER protect_team_session_immutability
  BEFORE UPDATE OR DELETE ON public.team_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_team_session_immutability();

-- ============================================================================
-- 4. RLS & LEAST-PRIVILEGE TABLE GRANTS
-- ============================================================================
ALTER TABLE public.team_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.team_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_accounts TO authenticated;

REVOKE ALL ON public.team_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_sessions TO authenticated;

DROP POLICY IF EXISTS team_accounts_select_active_organiser ON public.team_accounts;
DROP POLICY IF EXISTS team_accounts_select_super_admin ON public.team_accounts;
CREATE POLICY team_accounts_select_super_admin
  ON public.team_accounts
  FOR SELECT
  TO authenticated
  USING (public.is_active_super_admin());

DROP POLICY IF EXISTS team_sessions_select_active_organiser ON public.team_sessions;
DROP POLICY IF EXISTS team_sessions_select_super_admin ON public.team_sessions;
CREATE POLICY team_sessions_select_super_admin
  ON public.team_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_active_super_admin());

-- Direct INSERT / UPDATE / DELETE remain revoked for anon and authenticated.
-- Event coordinators and team users cannot read team_accounts or team_sessions directly.
-- Future Stage 3B.2 organiser mutations will run server-side or via audited RPCs;
-- team session self-registration and logout use the locked SECURITY DEFINER RPCs below.

-- ============================================================================
-- 5. INTERNAL JWT SESSION EXTRACTOR & TEAM SESSION VALIDATION HELPERS
-- ============================================================================
-- Required function owner & privileges:
--   - Function owner (postgres when applied via Supabase SQL Editor / supabase db push)
--     MUST hold SELECT on auth.sessions (id, user_id, not_after), EXECUTE on
--     auth.uid() and auth.jwt(), and read/write privileges on public tables.
--   - Live Supabase assumptions to verify:
--       1. GoTrue access tokens include a valid UUID claim at auth.jwt() ->> 'session_id'.
--       2. auth.sessions exposes (id uuid, user_id uuid, not_after timestamptz).
CREATE OR REPLACE FUNCTION public.current_jwt_session_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_raw_session_id text;
BEGIN
  v_raw_session_id := NULLIF(
    pg_catalog.btrim(COALESCE(auth.jwt() ->> 'session_id', ''), E' \t\r\n'),
    ''
  );

  IF v_raw_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_raw_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_raw_session_id::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.current_jwt_session_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_active_team_session()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_session_id uuid;
BEGIN
  v_uid := auth.uid();
  v_session_id := public.current_jwt_session_id();

  IF v_uid IS NULL OR v_session_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.team_accounts ta
    JOIN public.contingents c
      ON c.id = ta.contingent_id
    JOIN public.team_sessions ts
      ON ts.team_account_id = ta.id
     AND ts.contingent_id = ta.contingent_id
    JOIN auth.sessions a
      ON a.id = ts.supabase_session_id
     AND a.user_id = v_uid
    WHERE ta.auth_user_id = v_uid
      AND ta.is_active = true
      AND c.is_active = true
      AND ts.supabase_session_id = v_session_id
      AND ts.revoked_at IS NULL
      AND (a.not_after IS NULL OR a.not_after > pg_catalog.statement_timestamp())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_team_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_team_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_team_contingent_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_session_id uuid;
  v_contingent_id uuid;
BEGIN
  v_uid := auth.uid();
  v_session_id := public.current_jwt_session_id();

  IF v_uid IS NULL OR v_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
  ) THEN
    RETURN NULL;
  END IF;

  SELECT ta.contingent_id
  INTO v_contingent_id
  FROM public.team_accounts ta
  JOIN public.contingents c
    ON c.id = ta.contingent_id
  JOIN public.team_sessions ts
    ON ts.team_account_id = ta.id
   AND ts.contingent_id = ta.contingent_id
  JOIN auth.sessions a
    ON a.id = ts.supabase_session_id
   AND a.user_id = v_uid
  WHERE ta.auth_user_id = v_uid
    AND ta.is_active = true
    AND c.is_active = true
    AND ts.supabase_session_id = v_session_id
    AND ts.revoked_at IS NULL
    AND (a.not_after IS NULL OR a.not_after > pg_catalog.statement_timestamp())
  LIMIT 1;

  RETURN v_contingent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.current_team_contingent_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_team_contingent_id() TO authenticated;

-- ============================================================================
-- 6. TRANSACTIONAL SESSION REGISTRATION & LOGOUT REVOCATION RPCS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_team_session()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_session_id uuid;
  v_now timestamptz;
  v_team_lookup record;
  v_team public.team_accounts%ROWTYPE;
  v_contingent record;
  v_existing public.team_sessions%ROWTYPE;
  v_inserted public.team_sessions%ROWTYPE;
  v_stale_pruned_count integer := 0;
  v_active_count integer := 0;
BEGIN
  v_uid := auth.uid();
  v_session_id := public.current_jwt_session_id();

  IF v_uid IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated team session with valid JWT session_id is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
  ) THEN
    RAISE EXCEPTION 'Organiser accounts cannot register team sessions';
  END IF;

  -- Resolve immutable team account & contingent identifiers, then acquire locks in the
  -- canonical global order across all Stage 3B.1 paths:
  --   1. public.contingents (FOR SHARE)
  --   2. public.team_accounts (FOR UPDATE)
  --   3. virtuoso_team_session:<team_account_id> advisory lock
  --   4. public.team_sessions rows
  SELECT ta.id, ta.contingent_id
  INTO v_team_lookup
  FROM public.team_accounts ta
  WHERE ta.auth_user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team account does not exist for authenticated user';
  END IF;

  SELECT c.id, c.is_active
  INTO v_contingent
  FROM public.contingents c
  WHERE c.id = v_team_lookup.contingent_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent associated with this team account does not exist';
  END IF;

  SELECT *
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.id = v_team_lookup.id
    AND ta.auth_user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team account does not exist for authenticated user';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_team_session:' || v_team.id::text)
  );

  -- Capture timestamp AFTER acquiring locks so concurrent comparisons use post-lock time
  v_now := pg_catalog.clock_timestamp();

  IF v_contingent.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Contingent associated with this team account is inactive';
  END IF;

  IF v_team.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'This team account is inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.sessions a
    WHERE a.id = v_session_id
      AND a.user_id = v_uid
      AND (a.not_after IS NULL OR a.not_after > v_now)
  ) THEN
    RAISE EXCEPTION 'Supabase auth session is missing or expired';
  END IF;

  -- Clean up stale open sessions whose underlying Supabase auth session has disappeared or expired
  UPDATE public.team_sessions ts
  SET
    revoked_at = v_now,
    revoked_reason = 'auth_session_expired'
  WHERE ts.team_account_id = v_team.id
    AND ts.revoked_at IS NULL
    AND ts.supabase_session_id <> v_session_id
    AND NOT EXISTS (
      SELECT 1
      FROM auth.sessions a
      WHERE a.id = ts.supabase_session_id
        AND a.user_id = v_uid
        AND (a.not_after IS NULL OR a.not_after > v_now)
    );

  GET DIAGNOSTICS v_stale_pruned_count = ROW_COUNT;

  IF v_stale_pruned_count > 0 THEN
    INSERT INTO public.audit_logs (
      actor_user_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      after_data,
      metadata
    )
    VALUES (
      NULL,
      NULL,
      'team_session.stale_pruned',
      'team_account',
      v_team.id::text,
      jsonb_build_object(
        'stale_pruned_count', v_stale_pruned_count,
        'revoked_reason', 'auth_session_expired'
      ),
      jsonb_build_object(
        'team_account_id', v_team.id,
        'contingent_id', v_team.contingent_id,
        'triggered_by_session_id', v_session_id,
        'timestamp', v_now
      )
    );
  END IF;

  -- Check whether this Supabase session_id already has a tracked team_sessions row
  SELECT *
  INTO v_existing
  FROM public.team_sessions ts
  WHERE ts.supabase_session_id = v_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.team_account_id <> v_team.id THEN
      RAISE EXCEPTION 'Session identifier belongs to another team account';
    END IF;

    IF v_existing.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'This session has been revoked. Sign in again to start a new session.';
    END IF;

    UPDATE public.team_sessions
    SET last_seen_at = GREATEST(last_seen_at, v_now)
    WHERE id = v_existing.id;

    SELECT count(*)::integer
    INTO v_active_count
    FROM public.team_sessions ts
    WHERE ts.team_account_id = v_team.id
      AND ts.revoked_at IS NULL;

    RETURN jsonb_build_object(
      'operation', 'refreshed',
      'contingent_id', v_team.contingent_id,
      'active_session_count', v_active_count,
      'max_sessions', 4,
      'stale_pruned_count', v_stale_pruned_count
    );
  END IF;

  -- Enforce maximum 4 concurrent active sessions without evicting existing devices
  SELECT count(*)::integer
  INTO v_active_count
  FROM public.team_sessions ts
  WHERE ts.team_account_id = v_team.id
    AND ts.revoked_at IS NULL;

  IF v_active_count >= 4 THEN
    RAISE EXCEPTION 'Maximum of 4 concurrent team sessions reached. Log out from an existing device before signing in.';
  END IF;

  INSERT INTO public.team_sessions (
    team_account_id,
    contingent_id,
    supabase_session_id,
    created_at,
    last_seen_at
  )
  VALUES (
    v_team.id,
    v_team.contingent_id,
    v_session_id,
    v_now,
    v_now
  )
  RETURNING *
  INTO v_inserted;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  )
  VALUES (
    NULL,
    NULL,
    'team_session.registered',
    'team_session',
    v_inserted.id::text,
    jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_team.contingent_id,
      'supabase_session_id', v_session_id,
      'created_at', v_inserted.created_at
    ),
    jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_team.contingent_id,
      'active_session_count', v_active_count + 1,
      'max_sessions', 4,
      'stale_pruned_count', v_stale_pruned_count,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'registered',
    'contingent_id', v_team.contingent_id,
    'active_session_count', v_active_count + 1,
    'max_sessions', 4,
    'stale_pruned_count', v_stale_pruned_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_team_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_team_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_current_team_session()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_session_id uuid;
  v_now timestamptz;
  v_team public.team_accounts%ROWTYPE;
  v_session public.team_sessions%ROWTYPE;
  v_updated public.team_sessions%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  v_session_id := public.current_jwt_session_id();

  IF v_uid IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated team session with valid JWT session_id is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
  ) THEN
    RAISE EXCEPTION 'Organiser accounts cannot revoke team sessions via team logout';
  END IF;

  SELECT *
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.auth_user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team account does not exist for authenticated user';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_team_session:' || v_team.id::text)
  );

  v_now := pg_catalog.clock_timestamp();

  SELECT *
  INTO v_session
  FROM public.team_sessions ts
  WHERE ts.team_account_id = v_team.id
    AND ts.supabase_session_id = v_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'operation', 'already_revoked_or_missing',
      'revoked', false
    );
  END IF;

  UPDATE public.team_sessions
  SET
    revoked_at = v_now,
    revoked_reason = 'logout'
  WHERE id = v_session.id
    AND team_account_id = v_team.id
    AND revoked_at IS NULL
  RETURNING *
  INTO v_updated;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  VALUES (
    NULL,
    NULL,
    'team_session.revoked',
    'team_session',
    v_updated.id::text,
    jsonb_build_object(
      'revoked_at', v_session.revoked_at,
      'revoked_reason', v_session.revoked_reason
    ),
    jsonb_build_object(
      'revoked_at', v_updated.revoked_at,
      'revoked_reason', v_updated.revoked_reason
    ),
    jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_team.contingent_id,
      'supabase_session_id', v_session_id,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'revoked',
    'revoked', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_current_team_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_current_team_session() TO authenticated;
