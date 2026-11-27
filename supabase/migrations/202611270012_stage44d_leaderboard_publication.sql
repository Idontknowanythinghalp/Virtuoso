-- Stage 4.4D Migration 0012: Explicit Leaderboard Publication State & Super Admin Controls
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser, is_active_super_admin)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (events)
--   202611220008_stage3a_overall_leaderboard.sql (leaderboard_entries)
-- Additive only. Does NOT modify Stage 3A leaderboard_entries rows or prior migrations.
-- All existing leaderboards default to unpublished until explicitly published by a Super Admin.

-- ============================================================================
-- 1. LEADERBOARD PUBLICATIONS TABLE & TIMESTAMP HELPER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_leaderboard_publication_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.leaderboard_publications (
  event_id uuid PRIMARY KEY REFERENCES public.events (id) ON DELETE RESTRICT,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz NULL,
  published_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  unpublished_at timestamptz NULL,
  unpublished_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leaderboard_publications_state_consistency_check'
      AND conrelid = 'public.leaderboard_publications'::regclass
  ) THEN
    ALTER TABLE public.leaderboard_publications
      ADD CONSTRAINT leaderboard_publications_state_consistency_check
      CHECK (
        (
          is_published = true
          AND published_at IS NOT NULL
          AND published_by IS NOT NULL
        )
        OR (
          is_published = false
          AND (
            (
              published_at IS NULL
              AND published_by IS NULL
              AND unpublished_at IS NULL
              AND unpublished_by IS NULL
            )
            OR (
              unpublished_at IS NOT NULL
              AND unpublished_by IS NOT NULL
            )
          )
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS leaderboard_publications_published_idx
  ON public.leaderboard_publications (is_published, event_id);

DROP TRIGGER IF EXISTS set_leaderboard_publications_updated_at ON public.leaderboard_publications;
CREATE TRIGGER set_leaderboard_publications_updated_at
  BEFORE UPDATE ON public.leaderboard_publications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_leaderboard_publication_updated_at();

-- ============================================================================
-- 2. ROW LEVEL SECURITY & PRIVILEGE HARDENING
-- ============================================================================
-- Direct table reads remain restricted to active organisers; participants and
-- anonymous callers have zero direct PostgREST access to publication or entry rows.
REVOKE ALL ON public.leaderboard_publications FROM PUBLIC;
REVOKE ALL ON public.leaderboard_publications FROM anon;
REVOKE ALL ON public.leaderboard_publications FROM authenticated;
GRANT SELECT ON public.leaderboard_publications TO authenticated;

ALTER TABLE public.leaderboard_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_publications_select_active_organiser ON public.leaderboard_publications;
CREATE POLICY leaderboard_publications_select_active_organiser
  ON public.leaderboard_publications
  FOR SELECT
  TO authenticated
  USING (public.is_active_organiser());

-- ============================================================================
-- 3. ATOMIC SUPER ADMIN PUBLICATION RPCs WITH TRANSACTIONAL AUDIT LOGGING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publish_event_leaderboard(
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_email text;
  v_now timestamptz;
  v_event record;
  v_entry_count integer;
  v_existing public.leaderboard_publications%ROWTYPE;
  v_has_existing boolean := false;
  v_after public.leaderboard_publications%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_super_admin() THEN
    RAISE EXCEPTION 'Active Super Admin privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event identifier is required';
  END IF;

  SELECT id, code, name, entry_mode, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_leaderboard:' || p_event_id::text)
  );

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot publish leaderboard for an archived event';
  END IF;

  IF v_event.status <> 'active' THEN
    RAISE EXCEPTION 'Only active events can have their leaderboard published';
  END IF;

  IF v_event.entry_mode NOT IN ('contingent', 'hybrid') THEN
    RAISE EXCEPTION 'Overall leaderboard requires contingent entries; this event is configured for individual entries only';
  END IF;

  SELECT count(*)::integer
  INTO v_entry_count
  FROM public.leaderboard_entries le
  WHERE le.event_id = p_event_id;

  IF COALESCE(v_entry_count, 0) < 1 THEN
    RAISE EXCEPTION 'Add at least one contingent to the leaderboard before publishing';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.leaderboard_publications lp
  WHERE lp.event_id = p_event_id
  FOR UPDATE;

  v_has_existing := FOUND;

  IF v_has_existing AND v_existing.is_published IS TRUE THEN
    RAISE EXCEPTION 'This event leaderboard is already published';
  END IF;

  v_now := clock_timestamp();

  INSERT INTO public.leaderboard_publications (
    event_id,
    is_published,
    published_at,
    published_by,
    unpublished_at,
    unpublished_by,
    created_at,
    updated_at
  )
  VALUES (
    p_event_id,
    true,
    v_now,
    v_actor_id,
    NULL,
    NULL,
    v_now,
    v_now
  )
  ON CONFLICT (event_id) DO UPDATE
  SET
    is_published = true,
    published_at = v_now,
    published_by = v_actor_id,
    unpublished_at = NULL,
    unpublished_by = NULL,
    updated_at = v_now
  RETURNING * INTO v_after;

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
    v_actor_id,
    v_actor_email,
    'leaderboard.published',
    'leaderboard_publication',
    p_event_id::text,
    CASE
      WHEN v_has_existing THEN jsonb_build_object(
        'is_published', v_existing.is_published,
        'published_at', v_existing.published_at,
        'published_by', v_existing.published_by,
        'unpublished_at', v_existing.unpublished_at,
        'unpublished_by', v_existing.unpublished_by
      )
      ELSE NULL
    END,
    jsonb_build_object(
      'is_published', v_after.is_published,
      'published_at', v_after.published_at,
      'published_by', v_after.published_by,
      'unpublished_at', v_after.unpublished_at,
      'unpublished_by', v_after.unpublished_by
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'entry_count', v_entry_count,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'published',
    'event_id', p_event_id,
    'is_published', true,
    'published_at', v_after.published_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_event_leaderboard(
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_email text;
  v_now timestamptz;
  v_event record;
  v_existing public.leaderboard_publications%ROWTYPE;
  v_after public.leaderboard_publications%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_super_admin() THEN
    RAISE EXCEPTION 'Active Super Admin privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event identifier is required';
  END IF;

  SELECT id, code, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_leaderboard:' || p_event_id::text)
  );

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot unpublish leaderboard for an archived event';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.leaderboard_publications lp
  WHERE lp.event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND OR v_existing.is_published IS NOT TRUE THEN
    RAISE EXCEPTION 'This event leaderboard is not currently published';
  END IF;

  v_now := clock_timestamp();

  UPDATE public.leaderboard_publications
  SET
    is_published = false,
    unpublished_at = v_now,
    unpublished_by = v_actor_id,
    updated_at = v_now
  WHERE event_id = p_event_id
  RETURNING * INTO v_after;

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
    v_actor_id,
    v_actor_email,
    'leaderboard.unpublished',
    'leaderboard_publication',
    p_event_id::text,
    jsonb_build_object(
      'is_published', v_existing.is_published,
      'published_at', v_existing.published_at,
      'published_by', v_existing.published_by,
      'unpublished_at', v_existing.unpublished_at,
      'unpublished_by', v_existing.unpublished_by
    ),
    jsonb_build_object(
      'is_published', v_after.is_published,
      'published_at', v_after.published_at,
      'published_by', v_after.published_by,
      'unpublished_at', v_after.unpublished_at,
      'unpublished_by', v_after.unpublished_by
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'unpublished',
    'event_id', p_event_id,
    'is_published', false,
    'unpublished_at', v_after.unpublished_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_event_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_event_leaderboard(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.unpublish_event_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_event_leaderboard(uuid) TO authenticated;

-- ============================================================================
-- 4. ATOMIC SINGLE-STATEMENT PARTICIPANT LEADERBOARD READER RPC (SERVICE_ROLE)
-- ============================================================================
-- Executes publication check, event eligibility, entry lookup, and contingent
-- display join in a single PostgreSQL statement snapshot so concurrent
-- unpublish operations cannot race with entry reads. Restricted strictly to
-- service_role; never exposed to anon or authenticated callers.
CREATE OR REPLACE FUNCTION public.get_participant_leaderboards_for_contingent(
  p_contingent_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible_events AS (
    SELECT DISTINCT
      e.id,
      e.code,
      e.name,
      e.entry_mode,
      e.status,
      (
        e.status IN ('active', 'archived')
        AND e.entry_mode IN ('contingent', 'hybrid')
        AND lp.is_published IS TRUE
        AND lp.published_at IS NOT NULL
      ) AS is_effectively_published,
      CASE
        WHEN (
          e.status IN ('active', 'archived')
          AND e.entry_mode IN ('contingent', 'hybrid')
          AND lp.is_published IS TRUE
          AND lp.published_at IS NOT NULL
        ) THEN lp.published_at
        ELSE NULL
      END AS effective_published_at
    FROM public.event_entries ee
    INNER JOIN public.events e
      ON e.id = ee.event_id
    LEFT JOIN public.leaderboard_publications lp
      ON lp.event_id = e.id
    WHERE p_contingent_id IS NOT NULL
      AND ee.contingent_id = p_contingent_id
      AND ee.entry_type = 'contingent'
      AND ee.status IN ('registered', 'checked_in')
      AND e.entry_mode IN ('contingent', 'hybrid')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_id', ev.id,
        'event_code', ev.code,
        'event_name', ev.name,
        'event_status', ev.status,
        'is_published', ev.is_effectively_published,
        'published_at', ev.effective_published_at,
        'entries', CASE
          WHEN ev.is_effectively_published THEN COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', le.id,
                  'event_id', le.event_id,
                  'contingent_id', le.contingent_id,
                  'contingent_code', COALESCE(c.contingent_code, '—'),
                  'contingent_name', COALESCE(c.name, 'Contingent'),
                  'institution_name', COALESCE(c.institution_name, '—'),
                  'position', le.position,
                  'display_value', le.display_value,
                  'created_at', le.created_at,
                  'updated_at', le.updated_at
                )
                ORDER BY le.position ASC, le.created_at ASC, le.id ASC
              )
              FROM public.leaderboard_entries le
              LEFT JOIN public.contingents c
                ON c.id = le.contingent_id
              WHERE le.event_id = ev.id
            ),
            '[]'::jsonb
          )
          ELSE '[]'::jsonb
        END
      )
      ORDER BY ev.code ASC, ev.name ASC
    ),
    '[]'::jsonb
  )
  FROM eligible_events ev;
$$;

REVOKE ALL ON FUNCTION public.get_participant_leaderboards_for_contingent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_participant_leaderboards_for_contingent(uuid) TO service_role;
