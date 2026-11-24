-- Stage 2B.3 Migration 0005: Codename assignment, scope constraints, RLS, and concurrency-safe RPCs
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser, set_updated_at)
--   202611160003_stage2a_competition_structure.sql (events, rounds, event_entries)
-- Additive only. Does NOT modify scores, judging, advancement, results, or registration_imports.

-- ============================================================================
-- 1. ADD COMPOSITE UNIQUE KEY ON EVENT_ENTRIES FOR CROSS-EVENT INTEGRITY
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_entries_id_event_unique'
      AND conrelid = 'public.event_entries'::regclass
  ) THEN
    ALTER TABLE public.event_entries
      ADD CONSTRAINT event_entries_id_event_unique
      UNIQUE (id, event_id);
  END IF;
END
$$;

-- ============================================================================
-- 2. ENTRY CODENAMES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.entry_codenames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  event_entry_id uuid NOT NULL,
  round_id uuid NULL,
  codename text NOT NULL,
  assignment_source text NOT NULL DEFAULT 'auto_generated',
  assigned_by uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT entry_codenames_entry_event_fkey
    FOREIGN KEY (event_entry_id, event_id)
    REFERENCES public.event_entries (id, event_id)
    ON DELETE RESTRICT,
  CONSTRAINT entry_codenames_round_event_fkey
    FOREIGN KEY (round_id, event_id)
    REFERENCES public.rounds (id, event_id)
    ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entry_codenames_code_format_check'
      AND conrelid = 'public.entry_codenames'::regclass
  ) THEN
    ALTER TABLE public.entry_codenames
      ADD CONSTRAINT entry_codenames_code_format_check
      CHECK (
        char_length(trim(codename)) BETWEEN 4 AND 40
        AND trim(codename) ~ '^[A-Za-z0-9][A-Za-z0-9-]{2,38}[A-Za-z0-9]$'
        AND trim(codename) !~ '--'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entry_codenames_source_check'
      AND conrelid = 'public.entry_codenames'::regclass
  ) THEN
    ALTER TABLE public.entry_codenames
      ADD CONSTRAINT entry_codenames_source_check
      CHECK (assignment_source IN ('auto_generated', 'manual'));
  END IF;
END
$$;

-- One codename assignment per entry within the applicable scope
CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_event_wide_entry_uidx
  ON public.entry_codenames (event_id, event_entry_id)
  WHERE round_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_per_round_entry_uidx
  ON public.entry_codenames (round_id, event_entry_id)
  WHERE round_id IS NOT NULL;

-- Unique codenames within the applicable scope (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_event_wide_code_uidx
  ON public.entry_codenames (event_id, lower(trim(codename)))
  WHERE round_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entry_codenames_per_round_code_uidx
  ON public.entry_codenames (round_id, lower(trim(codename)))
  WHERE round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entry_codenames_event_round_idx
  ON public.entry_codenames (event_id, round_id, created_at DESC);

DROP TRIGGER IF EXISTS set_entry_codenames_updated_at ON public.entry_codenames;
CREATE TRIGGER set_entry_codenames_updated_at
  BEFORE UPDATE ON public.entry_codenames
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. SCOPE & MODE CONSISTENCY TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_entry_codename_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_codename_mode text;
  v_event_status text;
  v_round_status text;
BEGIN
  NEW.codename := upper(trim(COALESCE(NEW.codename, '')));
  NEW.notes := NULLIF(trim(COALESCE(NEW.notes, '')), '');

  SELECT codename_mode, status
  INTO v_codename_mode, v_event_status
  FROM public.events
  WHERE id = NEW.event_id;

  IF v_codename_mode IS NULL THEN
    RAISE EXCEPTION 'Referenced event does not exist';
  END IF;

  IF v_event_status = 'archived' THEN
    RAISE EXCEPTION 'Cannot assign or modify codenames for an archived event';
  END IF;

  IF v_codename_mode = 'event_wide' AND NEW.round_id IS NOT NULL THEN
    RAISE EXCEPTION 'Event is configured for event_wide codenames; round_id must be NULL';
  END IF;

  IF v_codename_mode = 'per_round' AND NEW.round_id IS NULL THEN
    RAISE EXCEPTION 'Event is configured for per_round codenames; round_id is required';
  END IF;

  IF NEW.round_id IS NOT NULL THEN
    SELECT status
    INTO v_round_status
    FROM public.rounds
    WHERE id = NEW.round_id
      AND event_id = NEW.event_id;

    IF v_round_status IS NULL THEN
      RAISE EXCEPTION 'Referenced round does not belong to the specified event';
    END IF;

    IF v_round_status = 'archived' THEN
      RAISE EXCEPTION 'Cannot assign or modify codenames for an archived round';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id <> OLD.event_id
       OR NEW.event_entry_id <> OLD.event_entry_id
       OR NEW.round_id IS DISTINCT FROM OLD.round_id THEN
      RAISE EXCEPTION 'Codename assignment scope (event, round, or entry) cannot be changed after creation';
    END IF;
    NEW.assigned_by := OLD.assigned_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_entry_codename_consistency ON public.entry_codenames;
CREATE TRIGGER enforce_entry_codename_consistency
  BEFORE INSERT OR UPDATE ON public.entry_codenames
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_entry_codename_consistency();

CREATE OR REPLACE FUNCTION public.prevent_codename_mode_change_with_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codename_mode IS DISTINCT FROM OLD.codename_mode THEN
    IF EXISTS (
      SELECT 1
      FROM public.entry_codenames
      WHERE event_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot change event codename_mode while codename assignments exist for this event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_event_codename_mode ON public.events;
CREATE TRIGGER protect_event_codename_mode
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_codename_mode_change_with_assignments();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (Organiser SELECT Only; Mutations via Protected RPCs)
-- ============================================================================
REVOKE ALL ON public.entry_codenames FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.entry_codenames FROM authenticated;

ALTER TABLE public.entry_codenames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entry_codenames_select_active_organiser ON public.entry_codenames;
CREATE POLICY entry_codenames_select_active_organiser
  ON public.entry_codenames
  FOR SELECT
  TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS entry_codenames_insert_active_organiser ON public.entry_codenames;
DROP POLICY IF EXISTS entry_codenames_update_active_organiser ON public.entry_codenames;

-- ============================================================================
-- 5. CONCURRENCY-SAFE RPCs FOR BATCH ASSIGNMENT & MANUAL CORRECTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_event_codenames(
  p_event_id uuid,
  p_round_id uuid DEFAULT NULL,
  p_assignments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_email text;
  v_event record;
  v_round record;
  v_item jsonb;
  v_entry_id uuid;
  v_codename text;
  v_entry record;
  v_existing_id uuid;
  v_new_id uuid;
  v_assigned_count integer := 0;
  v_skipped_existing_count integer := 0;
  v_assigned_items jsonb := '[]'::jsonb;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event identifier is required';
  END IF;

  -- Serialize concurrent codename operations for this event + scope
  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_codenames:' || p_event_id::text || ':' || COALESCE(p_round_id::text, 'event'))
  );

  SELECT id, code, codename_mode, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot assign codenames for an archived event';
  END IF;

  IF v_event.codename_mode = 'event_wide' THEN
    IF p_round_id IS NOT NULL THEN
      RAISE EXCEPTION 'Event uses event_wide codename mode; do not supply a round_id';
    END IF;
  ELSIF v_event.codename_mode = 'per_round' THEN
    IF p_round_id IS NULL THEN
      RAISE EXCEPTION 'Event uses per_round codename mode; round_id is required';
    END IF;

    SELECT id, round_number, status
    INTO v_round
    FROM public.rounds
    WHERE id = p_round_id
      AND event_id = p_event_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced round does not belong to this event';
    END IF;

    IF v_round.status = 'archived' THEN
      RAISE EXCEPTION 'Cannot assign codenames for an archived round';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported codename mode';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb))
  LOOP
    v_entry_id := NULLIF(trim(COALESCE(v_item->>'event_entry_id', '')), '')::uuid;
    v_codename := upper(trim(COALESCE(v_item->>'codename', '')));

    IF v_entry_id IS NULL
       OR char_length(v_codename) < 4
       OR char_length(v_codename) > 40
       OR v_codename !~ '^[A-Z0-9][A-Z0-9-]{2,38}[A-Z0-9]$'
       OR v_codename ~ '--' THEN
      RAISE EXCEPTION 'Invalid codename assignment payload item';
    END IF;

    SELECT id, status
    INTO v_entry
    FROM public.event_entries
    WHERE id = v_entry_id
      AND event_id = p_event_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Event entry "%" does not belong to this event', v_entry_id;
    END IF;

    IF v_entry.status NOT IN ('registered', 'checked_in') THEN
      RAISE EXCEPTION 'Only registered or checked_in entries are eligible for automatic codename assignment';
    END IF;

    -- Preserve existing assignments unconditionally
    SELECT id
    INTO v_existing_id
    FROM public.entry_codenames
    WHERE event_id = p_event_id
      AND event_entry_id = v_entry_id
      AND round_id IS NOT DISTINCT FROM p_round_id;

    IF v_existing_id IS NOT NULL THEN
      v_skipped_existing_count := v_skipped_existing_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.entry_codenames (
      event_id,
      event_entry_id,
      round_id,
      codename,
      assignment_source,
      assigned_by,
      updated_by
    )
    VALUES (
      p_event_id,
      v_entry_id,
      p_round_id,
      v_codename,
      'auto_generated',
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_new_id;

    v_assigned_count := v_assigned_count + 1;
    v_assigned_items := v_assigned_items || jsonb_build_array(
      jsonb_build_object(
        'id', v_new_id,
        'event_entry_id', v_entry_id,
        'codename', v_codename
      )
    );
  END LOOP;

  -- Record atomic audit log in the same transaction when any new codenames are assigned
  IF v_assigned_count > 0 THEN
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
      'codename.batch_assigned',
      CASE WHEN p_round_id IS NULL THEN 'event' ELSE 'round' END,
      COALESCE(p_round_id, p_event_id)::text,
      NULL,
      jsonb_build_object(
        'event_id', p_event_id,
        'event_code', v_event.code,
        'codename_mode', v_event.codename_mode,
        'round_id', p_round_id,
        'round_number', CASE WHEN p_round_id IS NOT NULL THEN v_round.round_number ELSE NULL END,
        'assigned_count', v_assigned_count,
        'skipped_existing_count', v_skipped_existing_count,
        'assignments', v_assigned_items
      ),
      jsonb_build_object(
        'scope', v_event.codename_mode,
        'timestamp', timezone('utc', now())
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'assigned_count', v_assigned_count,
    'skipped_existing_count', v_skipped_existing_count,
    'assigned_items', v_assigned_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_entry_codename(
  p_event_id uuid,
  p_round_id uuid,
  p_event_entry_id uuid,
  p_codename text,
  p_allow_overwrite boolean DEFAULT false,
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
  v_event record;
  v_round record;
  v_entry record;
  v_existing record;
  v_clean_codename text;
  v_clean_notes text;
  v_new_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_event_entry_id IS NULL THEN
    RAISE EXCEPTION 'Event and entry identifiers are required';
  END IF;

  v_clean_codename := upper(trim(COALESCE(p_codename, '')));
  v_clean_notes := NULLIF(trim(COALESCE(p_notes, '')), '');

  IF char_length(v_clean_codename) < 4
     OR char_length(v_clean_codename) > 40
     OR v_clean_codename !~ '^[A-Z0-9][A-Z0-9-]{2,38}[A-Z0-9]$'
     OR v_clean_codename ~ '--' THEN
    RAISE EXCEPTION 'Codename must be 4–40 characters and contain only letters, numbers, and single hyphens';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_codenames:' || p_event_id::text || ':' || COALESCE(p_round_id::text, 'event'))
  );

  SELECT id, code, codename_mode, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot modify codenames for an archived event';
  END IF;

  IF v_event.codename_mode = 'event_wide' THEN
    IF p_round_id IS NOT NULL THEN
      RAISE EXCEPTION 'Event uses event_wide codename mode; round_id must be NULL';
    END IF;
  ELSIF v_event.codename_mode = 'per_round' THEN
    IF p_round_id IS NULL THEN
      RAISE EXCEPTION 'Event uses per_round codename mode; round_id is required';
    END IF;

    SELECT id, round_number, status
    INTO v_round
    FROM public.rounds
    WHERE id = p_round_id
      AND event_id = p_event_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced round does not belong to this event';
    END IF;

    IF v_round.status = 'archived' THEN
      RAISE EXCEPTION 'Cannot modify codenames for an archived round';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported codename mode';
  END IF;

  SELECT id, status
  INTO v_entry
  FROM public.event_entries
  WHERE id = p_event_entry_id
    AND event_id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event entry does not belong to this event';
  END IF;

  SELECT id, codename, assignment_source, notes
  INTO v_existing
  FROM public.entry_codenames
  WHERE event_id = p_event_id
    AND event_entry_id = p_event_entry_id
    AND round_id IS NOT DISTINCT FROM p_round_id
  FOR UPDATE;

  IF FOUND THEN
    IF NOT COALESCE(p_allow_overwrite, false) THEN
      RAISE EXCEPTION 'This entry already has a codename assigned. Explicit confirmation is required to modify it.';
    END IF;

    UPDATE public.entry_codenames
    SET
      codename = v_clean_codename,
      assignment_source = 'manual',
      updated_by = v_actor_id,
      notes = v_clean_notes
    WHERE id = v_existing.id;

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
      'codename.corrected',
      'entry_codename',
      v_existing.id::text,
      jsonb_build_object(
        'event_id', p_event_id,
        'round_id', p_round_id,
        'event_entry_id', p_event_entry_id,
        'codename', v_existing.codename,
        'assignment_source', v_existing.assignment_source,
        'notes', v_existing.notes
      ),
      jsonb_build_object(
        'event_id', p_event_id,
        'round_id', p_round_id,
        'event_entry_id', p_event_entry_id,
        'codename', v_clean_codename,
        'assignment_source', 'manual',
        'notes', v_clean_notes
      ),
      jsonb_build_object(
        'event_code', v_event.code,
        'codename_mode', v_event.codename_mode,
        'round_number', CASE WHEN p_round_id IS NOT NULL THEN v_round.round_number ELSE NULL END,
        'confirmed_overwrite', true,
        'timestamp', timezone('utc', now())
      )
    );

    RETURN jsonb_build_object(
      'operation', 'corrected',
      'id', v_existing.id,
      'before_codename', v_existing.codename,
      'after_codename', v_clean_codename,
      'before_source', v_existing.assignment_source,
      'after_source', 'manual',
      'before_notes', v_existing.notes,
      'after_notes', v_clean_notes
    );
  END IF;

  IF v_entry.status NOT IN ('registered', 'checked_in') THEN
    RAISE EXCEPTION 'Cannot assign a new codename to a withdrawn or disqualified entry';
  END IF;

  INSERT INTO public.entry_codenames (
    event_id,
    event_entry_id,
    round_id,
    codename,
    assignment_source,
    assigned_by,
    updated_by,
    notes
  )
  VALUES (
    p_event_id,
    p_event_entry_id,
    p_round_id,
    v_clean_codename,
    'manual',
    v_actor_id,
    v_actor_id,
    v_clean_notes
  )
  RETURNING id INTO v_new_id;

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
    'codename.manual_assigned',
    'entry_codename',
    v_new_id::text,
    NULL,
    jsonb_build_object(
      'event_id', p_event_id,
      'round_id', p_round_id,
      'event_entry_id', p_event_entry_id,
      'codename', v_clean_codename,
      'assignment_source', 'manual',
      'notes', v_clean_notes
    ),
    jsonb_build_object(
      'event_code', v_event.code,
      'codename_mode', v_event.codename_mode,
      'round_number', CASE WHEN p_round_id IS NOT NULL THEN v_round.round_number ELSE NULL END,
      'confirmed_overwrite', false,
      'timestamp', timezone('utc', now())
    )
  );

  RETURN jsonb_build_object(
    'operation', 'assigned',
    'id', v_new_id,
    'before_codename', NULL,
    'after_codename', v_clean_codename,
    'before_source', NULL,
    'after_source', 'manual',
    'before_notes', NULL,
    'after_notes', v_clean_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_event_codenames(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_event_codenames(uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_entry_codename(uuid, uuid, uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_entry_codename(uuid, uuid, uuid, text, boolean, text) TO authenticated;
