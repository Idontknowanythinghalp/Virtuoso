-- Stage 3B.3 Migration 0010: Secure Team Account Administration RPCs
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_super_admin)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (contingents)
--   202611240009_stage3b1_team_accounts.sql (team_accounts, team_sessions, triggers, lock order)
-- Additive only. Does NOT modify migrations 0001–0009.

-- Ownership & privilege requirements (must be satisfied by the migration runner, e.g. postgres):
--   - Functions marked SECURITY DEFINER run as their owner and require that owner to have:
--       1. SELECT on auth.users (id, email) and auth.sessions (id, user_id, not_after)
--       2. EXECUTE on auth.uid()
--       3. SELECT, INSERT, UPDATE on public.team_accounts, public.team_sessions,
--          public.profiles, public.contingents, and public.audit_logs
--   - Every Stage 3B.3 administrative RPC revokes EXECUTE from PUBLIC, anon, and service_role,
--     granting EXECUTE exclusively to authenticated callers holding a verified Supabase Auth
--     user JWT, and verifies inside assert_team_admin_actor() that auth.uid() resolves to an
--     active Super Admin profile in public.profiles. No caller-supplied actor ID is accepted.

-- ============================================================================
-- 1. INTERNAL AUTHENTICATED SUPER ADMIN ACTOR VERIFICATION HELPER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_team_admin_actor()
RETURNS TABLE (
  actor_id uuid,
  actor_email text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_actor public.profiles%ROWTYPE;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authenticated Super Admin session is required';
  END IF;

  IF NOT public.is_active_super_admin() THEN
    RAISE EXCEPTION 'Only an active Super Admin may perform team account operations';
  END IF;

  SELECT p.*
  INTO v_actor
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT FOUND
     OR v_actor.role <> 'super_admin'
     OR v_actor.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an active Super Admin may perform team account operations';
  END IF;

  actor_id := v_actor.id;
  actor_email := v_actor.email;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_team_admin_actor() FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 2. PREFLIGHT & ATOMIC TEAM ACCOUNT CREATION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_preflight_team_account_creation(
  p_contingent_code text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_existing public.team_accounts%ROWTYPE;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR pg_catalog.char_length(v_code) < 2 OR pg_catalog.char_length(v_code) > 40 THEN
    RAISE EXCEPTION 'Contingent code must be between 2 and 40 characters';
  END IF;

  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent "%" was not found', v_code;
  END IF;

  IF v_contingent.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Contingent "%" is inactive and cannot receive a team account', v_contingent.contingent_code;
  END IF;

  SELECT ta.*
  INTO v_existing
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id;

  IF FOUND THEN
    RAISE EXCEPTION 'A team account already exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'contingent_id', v_contingent.id,
    'contingent_code', v_contingent.contingent_code,
    'contingent_name', v_contingent.name,
    'institution_name', v_contingent.institution_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_preflight_team_account_creation(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_preflight_team_account_creation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_team_account(
  p_team_account_id uuid,
  p_contingent_id uuid,
  p_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_contingent public.contingents%ROWTYPE;
  v_existing public.team_accounts%ROWTYPE;
  v_auth_email text;
  v_expected_email text;
  v_inserted public.team_accounts%ROWTYPE;
  v_now timestamptz;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  IF p_team_account_id IS NULL OR p_contingent_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Team account, contingent, and Auth user identifiers are required';
  END IF;

  -- Lock contingent FOR UPDATE before accessing team_accounts to serialize
  -- creation per contingent and preserve canonical Stage 3B.1 lock ordering.
  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE c.id = p_contingent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent does not exist';
  END IF;

  IF v_contingent.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Contingent "%" is inactive and cannot receive a team account', v_contingent.contingent_code;
  END IF;

  v_expected_email := 'team-' || pg_catalog.lower(p_team_account_id::text) || '@team.virtuoso.invalid';

  SELECT pg_catalog.lower(u.email)
  INTO v_auth_email
  FROM auth.users u
  WHERE u.id = p_auth_user_id;

  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_expected_email THEN
    RAISE EXCEPTION 'Auth user identity does not match the generated team account';
  END IF;

  SELECT ta.*
  INTO v_existing
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.id = p_team_account_id
       AND v_existing.auth_user_id = p_auth_user_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'team_account_id', v_existing.id,
        'contingent_id', v_existing.contingent_id,
        'contingent_code', v_contingent.contingent_code,
        'contingent_name', v_contingent.name,
        'auth_user_id', v_existing.auth_user_id,
        'is_active', v_existing.is_active,
        'created_at', v_existing.created_at
      );
    END IF;

    RAISE EXCEPTION 'A team account already exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  v_now := pg_catalog.clock_timestamp();

  INSERT INTO public.team_accounts (
    id,
    contingent_id,
    auth_user_id,
    is_active,
    created_by,
    updated_by
  )
  VALUES (
    p_team_account_id,
    v_contingent.id,
    p_auth_user_id,
    true,
    v_actor.actor_id,
    v_actor.actor_id
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
    v_actor.actor_id,
    v_actor.actor_email,
    'team_account.created',
    'team_account',
    v_inserted.id::text,
    pg_catalog.jsonb_build_object(
      'team_account_id', v_inserted.id,
      'contingent_id', v_inserted.contingent_id,
      'is_active', v_inserted.is_active,
      'deactivated_at', v_inserted.deactivated_at,
      'deactivated_by', v_inserted.deactivated_by,
      'created_by', v_inserted.created_by,
      'updated_by', v_inserted.updated_by
    ),
    pg_catalog.jsonb_build_object(
      'contingent_code', v_contingent.contingent_code,
      'timestamp', v_now
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'team_account_id', v_inserted.id,
    'contingent_id', v_inserted.contingent_id,
    'contingent_code', v_contingent.contingent_code,
    'contingent_name', v_contingent.name,
    'auth_user_id', v_inserted.auth_user_id,
    'is_active', v_inserted.is_active,
    'created_at', v_inserted.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_team_account(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_team_account(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- 3. RESOLVE ACTIVE TEAM ACCOUNT & AUDIT PASSWORD RESET
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_active_team_account(
  p_contingent_code text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_team public.team_accounts%ROWTYPE;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR pg_catalog.char_length(v_code) < 2 OR pg_catalog.char_length(v_code) > 40 THEN
    RAISE EXCEPTION 'Contingent code must be between 2 and 40 characters';
  END IF;

  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent "%" was not found', v_code;
  END IF;

  IF v_contingent.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Contingent "%" is inactive; activate the contingent before resetting the team password', v_contingent.contingent_code;
  END IF;

  SELECT ta.*
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team account exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  IF v_team.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Team account for contingent "%" is inactive; activate it explicitly before resetting its password', v_contingent.contingent_code;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'team_account_id', v_team.id,
    'contingent_id', v_contingent.id,
    'contingent_code', v_contingent.contingent_code,
    'contingent_name', v_contingent.name,
    'auth_user_id', v_team.auth_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_active_team_account(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_active_team_account(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_team_password_reset(
  p_contingent_code text,
  p_team_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_team public.team_accounts%ROWTYPE;
  v_updated public.team_accounts%ROWTYPE;
  v_now timestamptz;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR p_team_account_id IS NULL THEN
    RAISE EXCEPTION 'Contingent code and team account identifier are required';
  END IF;

  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code)
  FOR SHARE;

  IF NOT FOUND OR v_contingent.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Active contingent "%" was not found', v_code;
  END IF;

  SELECT ta.*
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.id = p_team_account_id
    AND ta.contingent_id = v_contingent.id
  FOR UPDATE;

  IF NOT FOUND OR v_team.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Active team account was not found for contingent "%"', v_contingent.contingent_code;
  END IF;

  v_now := pg_catalog.clock_timestamp();

  UPDATE public.team_accounts
  SET updated_by = v_actor.actor_id
  WHERE id = v_team.id
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
    v_actor.actor_id,
    v_actor.actor_email,
    'team_account.password_reset',
    'team_account',
    v_team.id::text,
    pg_catalog.jsonb_build_object(
      'updated_by', v_team.updated_by,
      'updated_at', v_team.updated_at
    ),
    pg_catalog.jsonb_build_object(
      'updated_by', v_updated.updated_by,
      'updated_at', v_updated.updated_at
    ),
    pg_catalog.jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_contingent.id,
      'contingent_code', v_contingent.contingent_code,
      'timestamp', v_now
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'team_account_id', v_updated.id,
    'contingent_code', v_contingent.contingent_code,
    'updated_at', v_updated.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_team_password_reset(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_team_password_reset(text, uuid) TO authenticated;

-- ============================================================================
-- 4. ACTIVATE / DEACTIVATE TEAM ACCOUNT (WITH ATOMIC SESSION REVOCATION)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_set_team_account_active(
  p_contingent_code text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_team public.team_accounts%ROWTYPE;
  v_updated public.team_accounts%ROWTYPE;
  v_active_sessions integer := 0;
  v_now timestamptz;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Target active status is required';
  END IF;

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR pg_catalog.char_length(v_code) < 2 OR pg_catalog.char_length(v_code) > 40 THEN
    RAISE EXCEPTION 'Contingent code must be between 2 and 40 characters';
  END IF;

  -- Canonical global lock order:
  --   1. public.contingents (FOR SHARE)
  --   2. public.team_accounts (FOR UPDATE)
  --   3. virtuoso_team_session:<team_account_id> advisory lock
  --   4. public.team_sessions updates (via trigger on deactivation)
  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent "%" was not found', v_code;
  END IF;

  SELECT ta.*
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team account exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_team_session:' || v_team.id::text)
  );

  v_now := pg_catalog.clock_timestamp();

  IF v_team.is_active = p_is_active THEN
    RETURN pg_catalog.jsonb_build_object(
      'operation', CASE WHEN p_is_active THEN 'already_active' ELSE 'already_inactive' END,
      'team_account_id', v_team.id,
      'contingent_id', v_contingent.id,
      'contingent_code', v_contingent.contingent_code,
      'contingent_is_active', v_contingent.is_active,
      'is_active', v_team.is_active,
      'revoked_session_count', 0
    );
  END IF;

  IF p_is_active IS FALSE THEN
    SELECT pg_catalog.count(*)::integer
    INTO v_active_sessions
    FROM public.team_sessions ts
    WHERE ts.team_account_id = v_team.id
      AND ts.revoked_at IS NULL;

    -- AFTER UPDATE trigger revoke_sessions_on_team_account_deactivation() revokes
    -- every unrevoked session with revoked_reason = 'account_deactivated' and
    -- revoked_by = NEW.deactivated_by, while keeping session history intact.
    UPDATE public.team_accounts
    SET
      is_active = false,
      deactivated_at = v_now,
      deactivated_by = v_actor.actor_id,
      updated_by = v_actor.actor_id
    WHERE id = v_team.id
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
      v_actor.actor_id,
      v_actor.actor_email,
      'team_account.deactivated',
      'team_account',
      v_team.id::text,
      pg_catalog.jsonb_build_object(
        'is_active', v_team.is_active,
        'deactivated_at', v_team.deactivated_at,
        'deactivated_by', v_team.deactivated_by,
        'updated_by', v_team.updated_by
      ),
      pg_catalog.jsonb_build_object(
        'is_active', v_updated.is_active,
        'deactivated_at', v_updated.deactivated_at,
        'deactivated_by', v_updated.deactivated_by,
        'updated_by', v_updated.updated_by
      ),
      pg_catalog.jsonb_build_object(
        'team_account_id', v_team.id,
        'contingent_id', v_contingent.id,
        'contingent_code', v_contingent.contingent_code,
        'revoked_session_count', v_active_sessions,
        'revoked_reason', 'account_deactivated',
        'timestamp', v_now
      )
    );

    RETURN pg_catalog.jsonb_build_object(
      'operation', 'deactivated',
      'team_account_id', v_team.id,
      'contingent_id', v_contingent.id,
      'contingent_code', v_contingent.contingent_code,
      'contingent_is_active', v_contingent.is_active,
      'is_active', v_updated.is_active,
      'revoked_session_count', v_active_sessions
    );
  END IF;

  -- Migration 0009 constraint team_accounts_deactivation_consistency_check and trigger
  -- protect_team_account_integrity require deactivated_at IS NULL and deactivated_by IS NULL
  -- whenever is_active = true. Prior deactivation details remain permanently preserved in
  -- public.audit_logs (both original deactivation entry and prior_* fields below).
  -- Reactivation never modifies or un-revokes existing team_sessions rows.
  UPDATE public.team_accounts
  SET
    is_active = true,
    deactivated_at = NULL,
    deactivated_by = NULL,
    updated_by = v_actor.actor_id
  WHERE id = v_team.id
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
    v_actor.actor_id,
    v_actor.actor_email,
    'team_account.activated',
    'team_account',
    v_team.id::text,
    pg_catalog.jsonb_build_object(
      'is_active', v_team.is_active,
      'deactivated_at', v_team.deactivated_at,
      'deactivated_by', v_team.deactivated_by,
      'updated_by', v_team.updated_by
    ),
    pg_catalog.jsonb_build_object(
      'is_active', v_updated.is_active,
      'deactivated_at', v_updated.deactivated_at,
      'deactivated_by', v_updated.deactivated_by,
      'updated_by', v_updated.updated_by
    ),
    pg_catalog.jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_contingent.id,
      'contingent_code', v_contingent.contingent_code,
      'contingent_is_active', v_contingent.is_active,
      'prior_deactivated_at', v_team.deactivated_at,
      'prior_deactivated_by', v_team.deactivated_by,
      'restored_sessions', 0,
      'timestamp', v_now
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'operation', 'activated',
    'team_account_id', v_team.id,
    'contingent_id', v_contingent.id,
    'contingent_code', v_contingent.contingent_code,
    'contingent_is_active', v_contingent.is_active,
    'is_active', v_updated.is_active,
    'revoked_session_count', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_team_account_active(text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_team_account_active(text, boolean) TO authenticated;

-- ============================================================================
-- 5. LIST & REVOKE DEVICE SESSIONS (WITHOUT EXPOSING SUPABASE SESSION IDS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_list_team_sessions(
  p_contingent_code text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_team public.team_accounts%ROWTYPE;
  v_now timestamptz;
  v_sessions jsonb;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR pg_catalog.char_length(v_code) < 2 OR pg_catalog.char_length(v_code) > 40 THEN
    RAISE EXCEPTION 'Contingent code must be between 2 and 40 characters';
  END IF;

  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent "%" was not found', v_code;
  END IF;

  SELECT ta.*
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team account exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  v_now := pg_catalog.clock_timestamp();

  -- Deliberately exclude ts.supabase_session_id and v_team.auth_user_id from output.
  -- Expose only internal team_sessions.id alongside timestamps and revocation metadata.
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'session_id', ts.id,
        'created_at', ts.created_at,
        'last_seen_at', ts.last_seen_at,
        'revoked_at', ts.revoked_at,
        'revoked_reason', ts.revoked_reason,
        'is_active', (
          ts.revoked_at IS NULL
          AND v_team.is_active IS TRUE
          AND v_contingent.is_active IS TRUE
          AND a.id IS NOT NULL
          AND (a.not_after IS NULL OR a.not_after > v_now)
        )
      )
      ORDER BY (ts.revoked_at IS NOT NULL) ASC, ts.created_at DESC, ts.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_sessions
  FROM public.team_sessions ts
  LEFT JOIN auth.sessions a
    ON a.id = ts.supabase_session_id
   AND a.user_id = v_team.auth_user_id
  WHERE ts.team_account_id = v_team.id;

  RETURN pg_catalog.jsonb_build_object(
    'contingent_id', v_contingent.id,
    'contingent_code', v_contingent.contingent_code,
    'contingent_name', v_contingent.name,
    'contingent_is_active', v_contingent.is_active,
    'team_account_id', v_team.id,
    'team_account_is_active', v_team.is_active,
    'sessions', v_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_team_sessions(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_team_sessions(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_team_session(
  p_contingent_code text,
  p_team_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_team public.team_accounts%ROWTYPE;
  v_session public.team_sessions%ROWTYPE;
  v_updated public.team_sessions%ROWTYPE;
  v_now timestamptz;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  IF p_team_session_id IS NULL THEN
    RAISE EXCEPTION 'Team session identifier is required';
  END IF;

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR pg_catalog.char_length(v_code) < 2 OR pg_catalog.char_length(v_code) > 40 THEN
    RAISE EXCEPTION 'Contingent code must be between 2 and 40 characters';
  END IF;

  -- Canonical lock order: contingents -> team_accounts -> advisory lock -> team_sessions
  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent "%" was not found', v_code;
  END IF;

  SELECT ta.*
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team account exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_team_session:' || v_team.id::text)
  );

  SELECT ts.*
  INTO v_session
  FROM public.team_sessions ts
  WHERE ts.id = p_team_session_id
    AND ts.team_account_id = v_team.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team session was not found for contingent "%"', v_contingent.contingent_code;
  END IF;

  IF v_session.revoked_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'operation', 'already_revoked',
      'revoked', false,
      'session_id', v_session.id,
      'contingent_code', v_contingent.contingent_code,
      'revoked_at', v_session.revoked_at,
      'revoked_reason', v_session.revoked_reason
    );
  END IF;

  v_now := pg_catalog.clock_timestamp();

  UPDATE public.team_sessions
  SET
    revoked_at = GREATEST(created_at, v_now),
    revoked_reason = 'organiser_revoked',
    revoked_by = v_actor.actor_id
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
    v_actor.actor_id,
    v_actor.actor_email,
    'team_session.revoked_by_admin',
    'team_session',
    v_updated.id::text,
    pg_catalog.jsonb_build_object(
      'revoked_at', v_session.revoked_at,
      'revoked_reason', v_session.revoked_reason,
      'revoked_by', v_session.revoked_by
    ),
    pg_catalog.jsonb_build_object(
      'revoked_at', v_updated.revoked_at,
      'revoked_reason', v_updated.revoked_reason,
      'revoked_by', v_updated.revoked_by
    ),
    pg_catalog.jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_contingent.id,
      'contingent_code', v_contingent.contingent_code,
      'team_session_id', v_updated.id,
      'timestamp', v_now
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'operation', 'revoked',
    'revoked', true,
    'session_id', v_updated.id,
    'contingent_code', v_contingent.contingent_code,
    'revoked_at', v_updated.revoked_at,
    'revoked_reason', v_updated.revoked_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_team_session(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_team_session(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_all_team_sessions(
  p_contingent_code text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_code text;
  v_contingent public.contingents%ROWTYPE;
  v_team public.team_accounts%ROWTYPE;
  v_revoked_ids uuid[];
  v_revoked_count integer := 0;
  v_now timestamptz;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  v_code := NULLIF(
    pg_catalog.upper(pg_catalog.btrim(COALESCE(p_contingent_code, ''), E' \t\r\n')),
    ''
  );
  IF v_code IS NULL OR pg_catalog.char_length(v_code) < 2 OR pg_catalog.char_length(v_code) > 40 THEN
    RAISE EXCEPTION 'Contingent code must be between 2 and 40 characters';
  END IF;

  -- Canonical lock order: contingents -> team_accounts -> advisory lock -> team_sessions
  SELECT c.*
  INTO v_contingent
  FROM public.contingents c
  WHERE pg_catalog.lower(pg_catalog.btrim(c.contingent_code, E' \t\r\n')) = pg_catalog.lower(v_code)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contingent "%" was not found', v_code;
  END IF;

  SELECT ta.*
  INTO v_team
  FROM public.team_accounts ta
  WHERE ta.contingent_id = v_contingent.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No team account exists for contingent "%"', v_contingent.contingent_code;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('virtuoso_team_session:' || v_team.id::text)
  );

  v_now := pg_catalog.clock_timestamp();

  WITH updated AS (
    UPDATE public.team_sessions ts
    SET
      revoked_at = GREATEST(ts.created_at, v_now),
      revoked_reason = 'organiser_revoked',
      revoked_by = v_actor.actor_id
    WHERE ts.team_account_id = v_team.id
      AND ts.revoked_at IS NULL
    RETURNING ts.id
  )
  SELECT
    COALESCE(pg_catalog.array_agg(u.id ORDER BY u.id), ARRAY[]::uuid[]),
    pg_catalog.count(*)::integer
  INTO v_revoked_ids, v_revoked_count
  FROM updated u;

  IF v_revoked_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'operation', 'none_active',
      'revoked_count', 0,
      'revoked_session_ids', '[]'::jsonb,
      'contingent_code', v_contingent.contingent_code
    );
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
    v_actor.actor_id,
    v_actor.actor_email,
    'team_session.all_revoked_by_admin',
    'team_account',
    v_team.id::text,
    pg_catalog.jsonb_build_object(
      'revoked_session_count', v_revoked_count,
      'revoked_session_ids', pg_catalog.to_jsonb(v_revoked_ids),
      'revoked_reason', 'organiser_revoked',
      'revoked_by', v_actor.actor_id
    ),
    pg_catalog.jsonb_build_object(
      'team_account_id', v_team.id,
      'contingent_id', v_contingent.id,
      'contingent_code', v_contingent.contingent_code,
      'timestamp', v_now
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'operation', 'revoked_all',
    'revoked_count', v_revoked_count,
    'revoked_session_ids', pg_catalog.to_jsonb(v_revoked_ids),
    'contingent_code', v_contingent.contingent_code,
    'revoked_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_all_team_sessions(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_team_sessions(text) TO authenticated;
