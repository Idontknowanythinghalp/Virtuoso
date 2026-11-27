-- Stage 4.4E Migration 0013: Numeric Draft Leaderboard & Atomic Published Snapshots
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser, is_active_super_admin)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (events, contingents, event_entries)
--   202611220008_stage3a_overall_leaderboard.sql (leaderboard_entries)
--   202611270012_stage44d_leaderboard_publication.sql (leaderboard_publications)
--
-- Additive / forward-only migration:
-- 1. Adds numeric `score` to draft `leaderboard_entries` and makes `position`/`display_value`
--    nullable for automatic standard competition ranking (1, 1, 3) and optional unscored entries.
-- 2. Safely migrates strictly numeric `display_value` strings to `score` while preserving
--    non-numeric legacy text entries without silent corruption or data loss.
-- 3. Introduces `leaderboard_published_entries` so participant-visible standings are an
--    immutable published snapshot replaced atomically on Publish Ranking.
-- 4. Revokes execute on legacy manual-position CRUD RPCs and provides numeric draft CRUD RPCs.
-- 5. Updates `publish_event_leaderboard`, `unpublish_event_leaderboard`, and
--    `get_participant_leaderboards_for_contingent` to operate strictly on the published snapshot.

-- ============================================================================
-- 1. EXTEND DRAFT LEADERBOARD_ENTRIES FOR NUMERIC SCORES & OPTIONAL UNRANKED
-- ============================================================================
ALTER TABLE public.leaderboard_entries
  ADD COLUMN IF NOT EXISTS score numeric(16,4) NULL;

ALTER TABLE public.leaderboard_entries
  ALTER COLUMN position DROP NOT NULL,
  ALTER COLUMN display_value DROP NOT NULL;

ALTER TABLE public.leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_position_check;

ALTER TABLE public.leaderboard_entries
  ADD CONSTRAINT leaderboard_entries_position_check
  CHECK (position IS NULL OR position BETWEEN 1 AND 10000);

ALTER TABLE public.leaderboard_entries
  DROP CONSTRAINT IF EXISTS leaderboard_entries_display_value_check;

ALTER TABLE public.leaderboard_entries
  ADD CONSTRAINT leaderboard_entries_display_value_check
  CHECK (display_value IS NULL OR char_length(trim(display_value)) BETWEEN 1 AND 120);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leaderboard_entries_score_check'
      AND conrelid = 'public.leaderboard_entries'::regclass
  ) THEN
    ALTER TABLE public.leaderboard_entries
      ADD CONSTRAINT leaderboard_entries_score_check
      CHECK (score IS NULL OR (score >= -1000000000 AND score <= 1000000000));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS leaderboard_entries_event_score_idx
  ON public.leaderboard_entries (event_id, score DESC NULLS LAST, created_at ASC, id ASC);

-- Preserve validation trigger behaviour while supporting nullable position/display_value and numeric score
CREATE OR REPLACE FUNCTION public.validate_leaderboard_entry_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_status text;
  v_event_entry_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id <> OLD.event_id
       OR NEW.event_entry_id <> OLD.event_entry_id
       OR NEW.contingent_id <> OLD.contingent_id THEN
      RAISE EXCEPTION 'Leaderboard entry event, event_entry, and contingent links are immutable';
    END IF;
  END IF;

  SELECT status
  INTO v_event_status
  FROM public.events
  WHERE id = NEW.event_id;

  IF v_event_status IS NULL THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  IF v_event_status = 'archived' THEN
    RAISE EXCEPTION 'Leaderboard entries cannot be created or modified for an archived event';
  END IF;

  SELECT entry_type
  INTO v_event_entry_type
  FROM public.event_entries
  WHERE id = NEW.event_entry_id
    AND event_id = NEW.event_id
    AND contingent_id = NEW.contingent_id;

  IF v_event_entry_type IS NULL OR v_event_entry_type <> 'contingent' THEN
    RAISE EXCEPTION 'Leaderboard entries must reference a registered contingent entry for this event';
  END IF;

  IF NEW.score IS NOT NULL THEN
    IF NEW.score < -1000000000 OR NEW.score > 1000000000 THEN
      RAISE EXCEPTION 'Score must be between -1,000,000,000 and 1,000,000,000';
    END IF;
    IF round(NEW.score, 4) <> NEW.score THEN
      RAISE EXCEPTION 'Score cannot have more than 4 decimal places';
    END IF;
  END IF;

  NEW.display_value := NULLIF(trim(COALESCE(NEW.display_value, '')), '');
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, ''), E' \t\r\n'), '');

  IF NEW.notes IS NOT NULL AND char_length(NEW.notes) > 500 THEN
    RAISE EXCEPTION 'Notes cannot exceed 500 characters';
  END IF;

  RETURN NEW;
END;
$$;

-- Safe backfill: migrate strictly numeric display_value strings (<=10 integer digits, <=4 decimals)
-- only on non-archived events or in general? Wait: the trigger blocks updates on archived events!
-- Temporarily disable only user trigger or only backfill where event is not archived?
-- Wait: if an archived event was published with numeric display_value, we can safely backfill its score
-- cleanly without altering archived trigger semantics by checking event status OR running carefully.
-- Actually, let's check: the integrity trigger blocks archived updates. Backfilling active/draft/inactive
-- draft rows respects the archived lock, AND for the published snapshot backfill below we can parse
-- strictly numeric display_value directly into leaderboard_published_entries.score even for archived events!
UPDATE public.leaderboard_entries le
SET score = CASE
  WHEN trim(le.display_value) ~ '^-?(?:[0-9]{1,10}(?:\.[0-9]{1,4})?|\.[0-9]{1,4})$'
    THEN trim(le.display_value)::numeric(16,4)
  ELSE NULL
END
FROM public.events e
WHERE e.id = le.event_id
  AND e.status <> 'archived'
  AND le.score IS NULL
  AND le.display_value IS NOT NULL
  AND trim(le.display_value) ~ '^-?(?:[0-9]{1,10}(?:\.[0-9]{1,4})?|\.[0-9]{1,4})$'
  AND (trim(le.display_value)::numeric(16,4)) BETWEEN -1000000000 AND 1000000000;

-- ============================================================================
-- 2. PUBLISHED SNAPSHOT TABLE (ATOMICALLY REPLACED ON PUBLISH RANKING)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_published_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  contingent_id uuid NOT NULL REFERENCES public.contingents (id) ON DELETE RESTRICT,
  rank integer NULL,
  score numeric(16,4) NULL,
  display_label text NULL,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leaderboard_published_entries_event_contingent_unique
    UNIQUE (event_id, contingent_id),
  CONSTRAINT leaderboard_published_entries_rank_check
    CHECK (rank IS NULL OR rank BETWEEN 1 AND 10000),
  CONSTRAINT leaderboard_published_entries_score_check
    CHECK (score IS NULL OR (score >= -1000000000 AND score <= 1000000000)),
  CONSTRAINT leaderboard_published_entries_display_label_check
    CHECK (display_label IS NULL OR char_length(trim(display_label)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS leaderboard_published_entries_event_rank_idx
  ON public.leaderboard_published_entries (
    event_id,
    rank ASC NULLS LAST,
    score DESC NULLS LAST,
    contingent_id ASC
  );

DROP TRIGGER IF EXISTS set_leaderboard_published_entries_updated_at ON public.leaderboard_published_entries;
CREATE TRIGGER set_leaderboard_published_entries_updated_at
  BEFORE UPDATE ON public.leaderboard_published_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_leaderboard_updated_at();

REVOKE ALL ON public.leaderboard_published_entries FROM PUBLIC;
REVOKE ALL ON public.leaderboard_published_entries FROM anon;
REVOKE ALL ON public.leaderboard_published_entries FROM authenticated;
GRANT SELECT ON public.leaderboard_published_entries TO authenticated;

ALTER TABLE public.leaderboard_published_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_published_entries_select_active_organiser ON public.leaderboard_published_entries;
CREATE POLICY leaderboard_published_entries_select_active_organiser
  ON public.leaderboard_published_entries
  FOR SELECT
  TO authenticated
  USING (public.is_active_organiser());

-- Idempotent snapshot backfill for any event that is already published when 0013 is applied.
-- Preserves existing published standings cleanly without blanking live participant views.
WITH backfill_source AS (
  SELECT
    le.event_id,
    le.contingent_id,
    le.position,
    COALESCE(
      le.score,
      CASE
        WHEN le.display_value IS NOT NULL
          AND trim(le.display_value) ~ '^-?(?:[0-9]{1,10}(?:\.[0-9]{1,4})?|\.[0-9]{1,4})$'
          AND (trim(le.display_value)::numeric(16,4)) BETWEEN -1000000000 AND 1000000000
          THEN trim(le.display_value)::numeric(16,4)
        ELSE NULL
      END
    ) AS resolved_score,
    le.display_value,
    lp.published_at,
    le.created_at,
    le.updated_at
  FROM public.leaderboard_entries le
  INNER JOIN public.leaderboard_publications lp
    ON lp.event_id = le.event_id
  WHERE lp.is_published IS TRUE
    AND lp.published_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.leaderboard_published_entries lpe
      WHERE lpe.event_id = le.event_id
    )
)
INSERT INTO public.leaderboard_published_entries (
  event_id,
  contingent_id,
  rank,
  score,
  display_label,
  published_at,
  created_at,
  updated_at
)
SELECT
  bs.event_id,
  bs.contingent_id,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM backfill_source bs2
      WHERE bs2.event_id = bs.event_id
        AND bs2.resolved_score IS NULL
        AND bs2.display_value IS NOT NULL
    ) THEN bs.position
    WHEN bs.resolved_score IS NULL THEN NULL
    ELSE (
      rank() OVER (
        PARTITION BY bs.event_id, (bs.resolved_score IS NOT NULL)
        ORDER BY bs.resolved_score DESC
      )
    )::integer
  END,
  bs.resolved_score,
  CASE
    WHEN bs.resolved_score IS NULL AND bs.display_value IS NOT NULL THEN bs.display_value
    ELSE NULL
  END,
  bs.published_at,
  bs.created_at,
  bs.updated_at
FROM backfill_source bs;

-- ============================================================================
-- 3. REVOKE LEGACY MANUAL-POSITION RPCs & ADD NUMERIC DRAFT CRUD RPCs
-- ============================================================================
-- Prevent any client from bypassing automatic numeric ranking via legacy manual-position RPCs.
REVOKE ALL ON FUNCTION public.add_leaderboard_entry(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_leaderboard_entry(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.remove_leaderboard_entry(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_leaderboard_entry(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_numeric_leaderboard_entry(
  p_event_id uuid,
  p_contingent_id uuid,
  p_score numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
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
  v_contingent record;
  v_event_entry record;
  v_clean_score numeric(16,4);
  v_clean_notes text;
  v_inserted public.leaderboard_entries%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_contingent_id IS NULL THEN
    RAISE EXCEPTION 'Event and contingent identifiers are required';
  END IF;

  IF p_score IS NOT NULL THEN
    IF p_score < -1000000000 OR p_score > 1000000000 THEN
      RAISE EXCEPTION 'Score must be between -1,000,000,000 and 1,000,000,000';
    END IF;
    IF round(p_score, 4) <> p_score THEN
      RAISE EXCEPTION 'Score cannot have more than 4 decimal places';
    END IF;
    v_clean_score := p_score::numeric(16,4);
  ELSE
    v_clean_score := NULL;
  END IF;

  v_clean_notes := NULLIF(btrim(COALESCE(p_notes, ''), E' \t\r\n'), '');
  IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 500 THEN
    RAISE EXCEPTION 'Notes cannot exceed 500 characters';
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

  v_now := clock_timestamp();

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot add leaderboard entries to an archived event';
  END IF;

  IF v_event.entry_mode NOT IN ('contingent', 'hybrid') THEN
    RAISE EXCEPTION 'Overall leaderboard requires contingent entries; this event is configured for individual entries only';
  END IF;

  SELECT id, contingent_code, is_active
  INTO v_contingent
  FROM public.contingents
  WHERE id = p_contingent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected contingent does not exist';
  END IF;

  IF v_contingent.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Inactive contingents cannot be added to the leaderboard';
  END IF;

  SELECT id, status
  INTO v_event_entry
  FROM public.event_entries
  WHERE event_id = p_event_id
    AND entry_type = 'contingent'
    AND contingent_id = p_contingent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected contingent is not registered in this event';
  END IF;

  IF v_event_entry.status NOT IN ('registered', 'checked_in') THEN
    RAISE EXCEPTION 'Only registered or checked-in contingents can be added to the leaderboard (current status: "%")', v_event_entry.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.leaderboard_entries le
    WHERE le.event_id = p_event_id
      AND le.contingent_id = p_contingent_id
  ) THEN
    RAISE EXCEPTION 'This contingent already has an entry on the event leaderboard';
  END IF;

  INSERT INTO public.leaderboard_entries (
    event_id,
    event_entry_id,
    contingent_id,
    position,
    display_value,
    score,
    notes,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  VALUES (
    p_event_id,
    v_event_entry.id,
    p_contingent_id,
    NULL,
    NULL,
    v_clean_score,
    v_clean_notes,
    v_actor_id,
    v_actor_id,
    v_now,
    v_now
  )
  RETURNING * INTO v_inserted;

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
    'leaderboard.entry_added',
    'leaderboard_entry',
    v_inserted.id::text,
    NULL,
    jsonb_build_object(
      'event_id', v_inserted.event_id,
      'event_entry_id', v_inserted.event_entry_id,
      'contingent_id', v_inserted.contingent_id,
      'score', v_inserted.score,
      'notes', v_inserted.notes,
      'created_by', v_inserted.created_by,
      'updated_by', v_inserted.updated_by,
      'created_at', v_inserted.created_at,
      'updated_at', v_inserted.updated_at
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'contingent_code', v_contingent.contingent_code,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'added',
    'id', v_inserted.id,
    'score', v_inserted.score
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_numeric_leaderboard_entry(
  p_event_id uuid,
  p_entry_id uuid,
  p_score numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
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
  v_contingent_code text;
  v_existing public.leaderboard_entries%ROWTYPE;
  v_updated public.leaderboard_entries%ROWTYPE;
  v_clean_score numeric(16,4);
  v_clean_notes text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_entry_id IS NULL THEN
    RAISE EXCEPTION 'Event and leaderboard entry identifiers are required';
  END IF;

  IF p_score IS NOT NULL THEN
    IF p_score < -1000000000 OR p_score > 1000000000 THEN
      RAISE EXCEPTION 'Score must be between -1,000,000,000 and 1,000,000,000';
    END IF;
    IF round(p_score, 4) <> p_score THEN
      RAISE EXCEPTION 'Score cannot have more than 4 decimal places';
    END IF;
    v_clean_score := p_score::numeric(16,4);
  ELSE
    v_clean_score := NULL;
  END IF;

  v_clean_notes := NULLIF(btrim(COALESCE(p_notes, ''), E' \t\r\n'), '');
  IF v_clean_notes IS NOT NULL AND char_length(v_clean_notes) > 500 THEN
    RAISE EXCEPTION 'Notes cannot exceed 500 characters';
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

  SELECT *
  INTO v_existing
  FROM public.leaderboard_entries
  WHERE id = p_entry_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leaderboard entry was not found for this event';
  END IF;

  v_now := clock_timestamp();

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot modify leaderboard entries for an archived event';
  END IF;

  SELECT contingent_code
  INTO v_contingent_code
  FROM public.contingents
  WHERE id = v_existing.contingent_id;

  UPDATE public.leaderboard_entries
  SET
    score = v_clean_score,
    position = NULL,
    display_value = NULL,
    notes = v_clean_notes,
    updated_by = v_actor_id
  WHERE id = p_entry_id
    AND event_id = p_event_id
  RETURNING * INTO v_updated;

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
    'leaderboard.entry_updated',
    'leaderboard_entry',
    v_updated.id::text,
    jsonb_build_object(
      'score', v_existing.score,
      'position', v_existing.position,
      'display_value', v_existing.display_value,
      'notes', v_existing.notes,
      'updated_by', v_existing.updated_by,
      'updated_at', v_existing.updated_at
    ),
    jsonb_build_object(
      'score', v_updated.score,
      'position', v_updated.position,
      'display_value', v_updated.display_value,
      'notes', v_updated.notes,
      'updated_by', v_updated.updated_by,
      'updated_at', v_updated.updated_at
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'contingent_id', v_updated.contingent_id,
      'contingent_code', v_contingent_code,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'updated',
    'id', v_updated.id,
    'score', v_updated.score
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_numeric_leaderboard_entry(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_numeric_leaderboard_entry(uuid, uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_numeric_leaderboard_entry(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_numeric_leaderboard_entry(uuid, uuid, numeric, text) TO authenticated;

-- ============================================================================
-- 4. ATOMIC SNAPSHOT PUBLICATION & UNPUBLICATION RPCs (SUPER ADMIN ONLY)
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
  v_ranked_count integer;
  v_unranked_count integer;
  v_legacy_count integer;
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

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE le.score IS NOT NULL)::integer,
    count(*) FILTER (WHERE le.score IS NULL)::integer,
    count(*) FILTER (WHERE le.score IS NULL AND le.display_value IS NOT NULL)::integer
  INTO v_entry_count, v_ranked_count, v_unranked_count, v_legacy_count
  FROM public.leaderboard_entries le
  WHERE le.event_id = p_event_id;

  IF COALESCE(v_entry_count, 0) < 1 THEN
    RAISE EXCEPTION 'Add at least one contingent to the leaderboard before publishing';
  END IF;

  IF COALESCE(v_legacy_count, 0) > 0 THEN
    RAISE EXCEPTION 'Some draft entries still have legacy non-numeric values; enter a numeric score or clear them before publishing';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.leaderboard_publications lp
  WHERE lp.event_id = p_event_id
  FOR UPDATE;

  v_has_existing := FOUND;
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

  -- Atomically replace the published snapshot inside the same transaction
  DELETE FROM public.leaderboard_published_entries
  WHERE event_id = p_event_id;

  INSERT INTO public.leaderboard_published_entries (
    event_id,
    contingent_id,
    rank,
    score,
    display_label,
    published_at,
    created_at,
    updated_at
  )
  SELECT
    le.event_id,
    le.contingent_id,
    CASE
      WHEN le.score IS NULL THEN NULL
      ELSE (
        rank() OVER (
          PARTITION BY (le.score IS NOT NULL)
          ORDER BY le.score DESC
        )
      )::integer
    END,
    le.score,
    NULL,
    v_now,
    v_now,
    v_now
  FROM public.leaderboard_entries le
  WHERE le.event_id = p_event_id;

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
      'ranked_count', v_ranked_count,
      'unranked_count', v_unranked_count,
      'republished', (v_has_existing AND v_existing.is_published IS TRUE),
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'published',
    'event_id', p_event_id,
    'is_published', true,
    'published_at', v_after.published_at,
    'entry_count', v_entry_count
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

  -- Remove published snapshot rows while keeping draft leaderboard_entries intact
  DELETE FROM public.leaderboard_published_entries
  WHERE event_id = p_event_id;

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
-- 5. ATOMIC PARTICIPANT SNAPSHOT READER RPC (SERVICE_ROLE ONLY)
-- ============================================================================
-- Reads strictly from leaderboard_published_entries (never draft leaderboard_entries)
-- in a single PostgreSQL statement snapshot.
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
                  'id', lpe.id,
                  'event_id', lpe.event_id,
                  'contingent_id', lpe.contingent_id,
                  'contingent_code', COALESCE(c.contingent_code, '—'),
                  'contingent_name', COALESCE(c.name, 'Contingent'),
                  'institution_name', COALESCE(c.institution_name, '—'),
                  'rank', lpe.rank,
                  'score', lpe.score,
                  'display_label', lpe.display_label,
                  'updated_at', lpe.updated_at
                )
                ORDER BY
                  (lpe.rank IS NULL) ASC,
                  lpe.rank ASC NULLS LAST,
                  lpe.score DESC NULLS LAST,
                  COALESCE(c.contingent_code, '') ASC,
                  lpe.created_at ASC,
                  lpe.id ASC
              )
              FROM public.leaderboard_published_entries lpe
              LEFT JOIN public.contingents c
                ON c.id = lpe.contingent_id
              WHERE lpe.event_id = ev.id
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
