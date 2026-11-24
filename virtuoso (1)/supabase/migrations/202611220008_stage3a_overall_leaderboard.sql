-- Stage 3A Migration 0008: Overall Leaderboard (Manual Per-Event Contingent Rankings)
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (events, contingents, event_entries)
-- Additive only. Does NOT modify Stage 1, 2A, 2B, or 2C tables/functions except
-- adding a composite unique constraint on event_entries for DB-enforced FK isolation.

-- ============================================================================
-- 1. COMPOSITE UNIQUE KEY ON EVENT_ENTRIES FOR CROSS-EVENT CONTINGENT INTEGRITY
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_entries_id_event_contingent_unique'
      AND conrelid = 'public.event_entries'::regclass
  ) THEN
    ALTER TABLE public.event_entries
      ADD CONSTRAINT event_entries_id_event_contingent_unique
      UNIQUE (id, event_id, contingent_id);
  END IF;
END
$$;

-- ============================================================================
-- 2. LEADERBOARD ENTRIES TABLE & TIMESTAMP HELPER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_leaderboard_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  event_entry_id uuid NOT NULL,
  contingent_id uuid NOT NULL REFERENCES public.contingents (id) ON DELETE RESTRICT,
  position integer NOT NULL,
  display_value text NOT NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  updated_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leaderboard_entries_event_entry_contingent_fkey
    FOREIGN KEY (event_entry_id, event_id, contingent_id)
    REFERENCES public.event_entries (id, event_id, contingent_id)
    ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leaderboard_entries_position_check'
      AND conrelid = 'public.leaderboard_entries'::regclass
  ) THEN
    ALTER TABLE public.leaderboard_entries
      ADD CONSTRAINT leaderboard_entries_position_check
      CHECK (position BETWEEN 1 AND 10000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leaderboard_entries_display_value_check'
      AND conrelid = 'public.leaderboard_entries'::regclass
  ) THEN
    ALTER TABLE public.leaderboard_entries
      ADD CONSTRAINT leaderboard_entries_display_value_check
      CHECK (char_length(trim(display_value)) BETWEEN 1 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leaderboard_entries_notes_check'
      AND conrelid = 'public.leaderboard_entries'::regclass
  ) THEN
    ALTER TABLE public.leaderboard_entries
      ADD CONSTRAINT leaderboard_entries_notes_check
      CHECK (notes IS NULL OR char_length(btrim(notes, E' \t\r\n')) BETWEEN 1 AND 500);
  END IF;

  -- Enforce one entry per contingent per event (ties on position remain allowed)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leaderboard_entries_event_contingent_unique'
      AND conrelid = 'public.leaderboard_entries'::regclass
  ) THEN
    ALTER TABLE public.leaderboard_entries
      ADD CONSTRAINT leaderboard_entries_event_contingent_unique
      UNIQUE (event_id, contingent_id);
  END IF;
END
$$;

-- Authoritative ordering by position, with deterministic tie ordering by created_at, id
CREATE INDEX IF NOT EXISTS leaderboard_entries_event_position_idx
  ON public.leaderboard_entries (event_id, position ASC, created_at ASC, id ASC);

DROP TRIGGER IF EXISTS set_leaderboard_entries_updated_at ON public.leaderboard_entries;
CREATE TRIGGER set_leaderboard_entries_updated_at
  BEFORE UPDATE ON public.leaderboard_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_leaderboard_updated_at();

-- ============================================================================
-- 3. INTEGRITY VALIDATION TRIGGER
-- ============================================================================
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

  NEW.display_value := trim(NEW.display_value);
  NEW.notes := NULLIF(btrim(COALESCE(NEW.notes, ''), E' \t\r\n'), '');

  IF NEW.notes IS NOT NULL AND char_length(NEW.notes) > 500 THEN
    RAISE EXCEPTION 'Notes cannot exceed 500 characters';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_leaderboard_entry_integrity ON public.leaderboard_entries;
CREATE TRIGGER enforce_leaderboard_entry_integrity
  BEFORE INSERT OR UPDATE ON public.leaderboard_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_leaderboard_entry_integrity();

-- ============================================================================
-- 4. ROW LEVEL SECURITY & PRIVILEGE HARDENING
-- ============================================================================
REVOKE ALL ON public.leaderboard_entries FROM PUBLIC;
REVOKE ALL ON public.leaderboard_entries FROM anon;
REVOKE ALL ON public.leaderboard_entries FROM authenticated;
GRANT SELECT ON public.leaderboard_entries TO authenticated;

ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_entries_select_active_organiser ON public.leaderboard_entries;
CREATE POLICY leaderboard_entries_select_active_organiser
  ON public.leaderboard_entries
  FOR SELECT
  TO authenticated
  USING (public.is_active_organiser());

-- ============================================================================
-- 5. ATOMIC ORGANISER RPCs WITH TRANSACTIONAL AUDIT LOGGING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_leaderboard_entry(
  p_event_id uuid,
  p_contingent_id uuid,
  p_position integer,
  p_display_value text,
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
  v_clean_value text;
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

  IF p_position IS NULL OR p_position < 1 OR p_position > 10000 THEN
    RAISE EXCEPTION 'Position must be a whole number between 1 and 10,000';
  END IF;

  v_clean_value := trim(COALESCE(p_display_value, ''));
  IF char_length(v_clean_value) < 1 OR char_length(v_clean_value) > 120 THEN
    RAISE EXCEPTION 'Displayed score/result value must be between 1 and 120 characters';
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
    p_position,
    v_clean_value,
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
      'position', v_inserted.position,
      'display_value', v_inserted.display_value,
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
    'position', v_inserted.position,
    'display_value', v_inserted.display_value
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_leaderboard_entry(
  p_event_id uuid,
  p_entry_id uuid,
  p_position integer,
  p_display_value text,
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
  v_clean_value text;
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

  IF p_position IS NULL OR p_position < 1 OR p_position > 10000 THEN
    RAISE EXCEPTION 'Position must be a whole number between 1 and 10,000';
  END IF;

  v_clean_value := trim(COALESCE(p_display_value, ''));
  IF char_length(v_clean_value) < 1 OR char_length(v_clean_value) > 120 THEN
    RAISE EXCEPTION 'Displayed score/result value must be between 1 and 120 characters';
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
    position = p_position,
    display_value = v_clean_value,
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
      'position', v_existing.position,
      'display_value', v_existing.display_value,
      'notes', v_existing.notes,
      'updated_by', v_existing.updated_by,
      'updated_at', v_existing.updated_at
    ),
    jsonb_build_object(
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
    'position', v_updated.position,
    'display_value', v_updated.display_value
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_leaderboard_entry(
  p_event_id uuid,
  p_entry_id uuid
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
    RAISE EXCEPTION 'Cannot remove leaderboard entries from an archived event';
  END IF;

  SELECT contingent_code
  INTO v_contingent_code
  FROM public.contingents
  WHERE id = v_existing.contingent_id;

  DELETE FROM public.leaderboard_entries
  WHERE id = p_entry_id
    AND event_id = p_event_id;

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
    'leaderboard.entry_removed',
    'leaderboard_entry',
    v_existing.id::text,
    jsonb_build_object(
      'event_id', v_existing.event_id,
      'event_entry_id', v_existing.event_entry_id,
      'contingent_id', v_existing.contingent_id,
      'position', v_existing.position,
      'display_value', v_existing.display_value,
      'notes', v_existing.notes,
      'created_by', v_existing.created_by,
      'updated_by', v_existing.updated_by,
      'created_at', v_existing.created_at,
      'updated_at', v_existing.updated_at
    ),
    NULL,
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'contingent_code', v_contingent_code,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'removed',
    'id', v_existing.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_leaderboard_entry(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_leaderboard_entry(uuid, uuid, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_leaderboard_entry(uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_leaderboard_entry(uuid, uuid, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_leaderboard_entry(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_leaderboard_entry(uuid, uuid) TO authenticated;
