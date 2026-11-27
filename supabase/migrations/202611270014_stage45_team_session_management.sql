-- ============================================================================
-- Virtuoso 2026 CMS — Stage 4.5: Super Admin Team Session Management
-- Additive migration extending Stage 3B.1 (0009) & Stage 3B.3 (0010)
-- ============================================================================
-- Security & Concurrency Invariants:
--   1. All administrative session RPCs verify public.assert_team_admin_actor()
--      (authenticated JWT + active super_admin profile).
--   2. Outputs strictly exclude secret supabase_session_id, auth_user_id,
--      synthetic team emails, JWTs, refresh tokens, and passwords.
--   3. Expired or missing auth.sessions rows NEVER count as active sessions.
--   4. Global emergency logout follows canonical global lock order:
--        public.contingents (ORDER BY id ASC FOR SHARE)
--        -> public.team_accounts (ORDER BY id ASC FOR UPDATE)
--        -> virtuoso_team_session:<team_account_id> advisory locks (ORDER BY id ASC)
--        -> public.team_sessions updates
--      preventing deadlocks with register_team_session() and deactivation triggers.
--   5. Executed via user-scoped authenticated JWT client (never service_role).
-- ============================================================================

-- ============================================================================
-- 1. SUPER ADMIN TEAM SESSION OVERVIEW (ALL CONTINGENTS & ACTIVE SESSION COUNTS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_list_team_session_overviews()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_now timestamptz;
  v_teams jsonb;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  v_now := pg_catalog.clock_timestamp();

  WITH team_stats AS (
    SELECT
      c.id AS contingent_id,
      c.contingent_code,
      c.name AS contingent_name,
      c.institution_name,
      c.is_active AS contingent_is_active,
      ta.id AS team_account_id,
      (ta.id IS NOT NULL) AS has_team_account,
      COALESCE(ta.is_active, false) AS team_account_is_active,
      COALESCE(
        pg_catalog.count(ts.id) FILTER (
          WHERE ta.id IS NOT NULL
            AND ts.revoked_at IS NULL
            AND ta.is_active IS TRUE
            AND c.is_active IS TRUE
            AND a.id IS NOT NULL
            AND (a.not_after IS NULL OR a.not_after > v_now)
        ),
        0
      )::integer AS active_session_count,
      COALESCE(
        pg_catalog.count(ts.id) FILTER (
          WHERE ta.id IS NOT NULL
            AND ts.revoked_at IS NULL
            AND (a.id IS NULL OR (a.not_after IS NOT NULL AND a.not_after <= v_now))
        ),
        0
      )::integer AS expired_unpruned_count,
      COALESCE(pg_catalog.count(ts.id), 0)::integer AS total_session_count,
      pg_catalog.max(ts.last_seen_at) FILTER (
        WHERE ta.id IS NOT NULL
          AND ts.revoked_at IS NULL
          AND ta.is_active IS TRUE
          AND c.is_active IS TRUE
          AND a.id IS NOT NULL
          AND (a.not_after IS NULL OR a.not_after > v_now)
      ) AS most_recent_active_at,
      pg_catalog.max(ts.last_seen_at) AS most_recent_activity_at
    FROM public.contingents c
    LEFT JOIN public.team_accounts ta
      ON ta.contingent_id = c.id
    LEFT JOIN public.team_sessions ts
      ON ts.team_account_id = ta.id
    LEFT JOIN auth.sessions a
      ON a.id = ts.supabase_session_id
     AND a.user_id = ta.auth_user_id
    GROUP BY
      c.id,
      c.contingent_code,
      c.name,
      c.institution_name,
      c.is_active,
      ta.id,
      ta.is_active
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'contingent_id', t.contingent_id,
        'contingent_code', t.contingent_code,
        'contingent_name', t.contingent_name,
        'institution_name', t.institution_name,
        'contingent_is_active', t.contingent_is_active,
        'has_team_account', t.has_team_account,
        'team_account_is_active', t.team_account_is_active,
        'active_session_count', t.active_session_count,
        'max_sessions', 4,
        'is_logged_in', (t.active_session_count > 0),
        'expired_unpruned_count', t.expired_unpruned_count,
        'total_session_count', t.total_session_count,
        'most_recent_active_at', t.most_recent_active_at,
        'most_recent_activity_at', t.most_recent_activity_at
      )
      ORDER BY
        t.active_session_count DESC,
        t.most_recent_activity_at DESC NULLS LAST,
        t.contingent_code ASC
    ),
    '[]'::jsonb
  )
  INTO v_teams
  FROM team_stats t;

  RETURN pg_catalog.jsonb_build_object(
    'generated_at', v_now,
    'max_sessions', 4,
    'teams', v_teams
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_team_session_overviews() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_team_session_overviews() TO authenticated;

-- ============================================================================
-- 2. SUPER ADMIN TEAM SESSION DETAILS (INCLUDES SAFE EXPIRATION & STATUS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_team_session_details(
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
  v_active_count integer := 0;
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

  -- Deliberately exclude ts.supabase_session_id, v_team.auth_user_id, and a.id.
  -- Expose only safe public.team_sessions.id, timestamps, auth.sessions.not_after,
  -- revocation reason, and strict active/expired/revoked status.
  WITH classified AS (
    SELECT
      ts.id AS session_id,
      ts.created_at,
      ts.last_seen_at,
      a.not_after AS expires_at,
      ts.revoked_at,
      ts.revoked_reason,
      (
        ts.revoked_at IS NULL
        AND v_team.is_active IS TRUE
        AND v_contingent.is_active IS TRUE
        AND a.id IS NOT NULL
        AND (a.not_after IS NULL OR a.not_after > v_now)
      ) AS is_active,
      CASE
        WHEN ts.revoked_at IS NOT NULL AND ts.revoked_reason = 'auth_session_expired' THEN 'expired'
        WHEN ts.revoked_at IS NOT NULL THEN 'revoked'
        WHEN a.id IS NULL OR (a.not_after IS NOT NULL AND a.not_after <= v_now) THEN 'expired'
        WHEN v_team.is_active IS NOT TRUE OR v_contingent.is_active IS NOT TRUE THEN 'revoked'
        ELSE 'active'
      END AS status
    FROM public.team_sessions ts
    LEFT JOIN auth.sessions a
      ON a.id = ts.supabase_session_id
     AND a.user_id = v_team.auth_user_id
    WHERE ts.team_account_id = v_team.id
  )
  SELECT
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'session_id', s.session_id,
          'created_at', s.created_at,
          'last_seen_at', s.last_seen_at,
          'expires_at', s.expires_at,
          'revoked_at', s.revoked_at,
          'revoked_reason', s.revoked_reason,
          'is_active', s.is_active,
          'status', s.status
        )
        ORDER BY
          (CASE s.status WHEN 'active' THEN 0 WHEN 'expired' THEN 1 ELSE 2 END) ASC,
          s.last_seen_at DESC,
          s.created_at DESC,
          s.session_id ASC
      ),
      '[]'::jsonb
    ),
    COALESCE(pg_catalog.count(*) FILTER (WHERE s.is_active IS TRUE), 0)::integer
  INTO v_sessions, v_active_count
  FROM classified s;

  RETURN pg_catalog.jsonb_build_object(
    'contingent_id', v_contingent.id,
    'contingent_code', v_contingent.contingent_code,
    'contingent_name', v_contingent.name,
    'institution_name', v_contingent.institution_name,
    'contingent_is_active', v_contingent.is_active,
    'team_account_is_active', v_team.is_active,
    'active_session_count', v_active_count,
    'max_sessions', 4,
    'sessions', v_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_team_session_details(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_team_session_details(text) TO authenticated;

-- ============================================================================
-- 3. GLOBAL EMERGENCY LOGOUT ACROSS ALL TEAMS (ATOMIC & IDEMPOTENT)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_revoke_all_teams_sessions()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_actor record;
  v_team_row record;
  v_now timestamptz;
  v_expired_pruned_count integer := 0;
  v_revoked_count integer := 0;
  v_affected_team_count integer := 0;
  v_affected_codes text[] := ARRAY[]::text[];
  v_revoked_session_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT *
  INTO v_actor
  FROM public.assert_team_admin_actor();

  -- Canonical deterministic global lock order across all Stage 3B/4.5 functions:
  --   1. public.contingents (ORDER BY id ASC FOR SHARE)
  --   2. LOCK TABLE public.team_accounts IN SHARE MODE (blocks concurrent INSERT/FOR UPDATE
  --      from admin_create_team_account or register_team_session even for new contingents)
  --   3. public.team_accounts (ORDER BY id ASC FOR UPDATE)
  --   4. virtuoso_team_session:<team_account_id> advisory locks (ORDER BY id ASC)
  --   5. public.team_sessions row updates
  PERFORM c.id
  FROM public.contingents c
  ORDER BY c.id ASC
  FOR SHARE;

  LOCK TABLE public.team_accounts IN SHARE MODE;

  FOR v_team_row IN
    SELECT ta.id
    FROM public.team_accounts ta
    ORDER BY ta.id ASC
    FOR UPDATE
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('virtuoso_team_session:' || v_team_row.id::text)
    );
  END LOOP;

  v_now := pg_catalog.clock_timestamp();

  -- First mark any genuinely expired/missing auth.sessions rows as auth_session_expired
  -- so stale abandoned slots are finalized accurately without attributing them to forced logout.
  WITH expired_rows AS (
    UPDATE public.team_sessions ts
    SET
      revoked_at = GREATEST(ts.created_at, v_now),
      revoked_reason = 'auth_session_expired',
      revoked_by = NULL
    FROM public.team_accounts ta
    WHERE ts.team_account_id = ta.id
      AND ts.revoked_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM auth.sessions a
        WHERE a.id = ts.supabase_session_id
          AND a.user_id = ta.auth_user_id
          AND (a.not_after IS NULL OR a.not_after > v_now)
      )
    RETURNING ts.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_expired_pruned_count
  FROM expired_rows;

  -- Forcefully revoke every remaining unrevoked session across all teams.
  WITH revoked_rows AS (
    UPDATE public.team_sessions ts
    SET
      revoked_at = GREATEST(ts.created_at, v_now),
      revoked_reason = 'organiser_revoked',
      revoked_by = v_actor.actor_id
    WHERE ts.revoked_at IS NULL
    RETURNING ts.id, ts.contingent_id
  )
  SELECT
    pg_catalog.count(*)::integer,
    COALESCE(pg_catalog.count(DISTINCT r.contingent_id), 0)::integer,
    COALESCE(
      pg_catalog.array_agg(DISTINCT c.contingent_code ORDER BY c.contingent_code),
      ARRAY[]::text[]
    ),
    COALESCE(
      pg_catalog.array_agg(r.id ORDER BY r.id),
      ARRAY[]::uuid[]
    )
  INTO
    v_revoked_count,
    v_affected_team_count,
    v_affected_codes,
    v_revoked_session_ids
  FROM revoked_rows r
  JOIN public.contingents c
    ON c.id = r.contingent_id;

  IF v_revoked_count = 0 AND v_expired_pruned_count = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'operation', 'none_active',
      'revoked_count', 0,
      'expired_pruned_count', 0,
      'affected_team_count', 0,
      'affected_contingent_codes', '[]'::jsonb,
      'revoked_at', v_now
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
    'team_session.global_revoked_by_admin',
    'team_session',
    'all_teams',
    pg_catalog.jsonb_build_object(
      'revoked_session_count', v_revoked_count,
      'expired_pruned_count', v_expired_pruned_count,
      'affected_team_count', v_affected_team_count,
      'affected_contingent_codes', pg_catalog.to_jsonb(v_affected_codes),
      'revoked_reason', 'organiser_revoked',
      'revoked_by', v_actor.actor_id
    ),
    pg_catalog.jsonb_build_object(
      'revoked_session_ids', pg_catalog.to_jsonb(v_revoked_session_ids),
      'timestamp', v_now
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'operation', CASE WHEN v_revoked_count > 0 THEN 'revoked_all_teams' ELSE 'none_active' END,
    'revoked_count', v_revoked_count,
    'expired_pruned_count', v_expired_pruned_count,
    'affected_team_count', v_affected_team_count,
    'affected_contingent_codes', pg_catalog.to_jsonb(v_affected_codes),
    'revoked_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_all_teams_sessions() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_teams_sessions() TO authenticated;
