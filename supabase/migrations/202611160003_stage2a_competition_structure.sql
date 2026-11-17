-- Stage 2A Migration 0003: Competition structure foundation
-- Tables: events, rounds, judging_criteria, contingents, participants, event_entries
-- Depends on: 202611160001_stage1b_profiles.sql (set_updated_at, is_active_organiser, profiles)
-- Do NOT modify Stage 1B tables, drop tables, or insert sample competition data.

-- ============================================================================
-- 1. EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  entry_mode text NOT NULL DEFAULT 'contingent',
  codename_mode text NOT NULL DEFAULT 'event_wide',
  status text NOT NULL DEFAULT 'draft',
  min_team_size integer NULL,
  max_team_size integer NULL,
  created_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_code_length_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_code_length_check
      CHECK (char_length(trim(code)) BETWEEN 2 AND 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_name_length_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_name_length_check
      CHECK (char_length(trim(name)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_entry_mode_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_entry_mode_check
      CHECK (entry_mode IN ('contingent', 'individual', 'hybrid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_codename_mode_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_codename_mode_check
      CHECK (codename_mode IN ('event_wide', 'per_round'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_status_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_status_check
      CHECK (status IN ('draft', 'active', 'inactive', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_team_size_bounds_check' AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_team_size_bounds_check
      CHECK (
        (min_team_size IS NULL OR min_team_size >= 1)
        AND (max_team_size IS NULL OR max_team_size >= 1)
        AND (min_team_size IS NULL OR max_team_size IS NULL OR max_team_size >= min_team_size)
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS events_code_lower_uidx
  ON public.events (lower(trim(code)));

CREATE INDEX IF NOT EXISTS events_status_created_idx
  ON public.events (status, created_at DESC);

DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;
CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. ROUNDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  round_number integer NOT NULL,
  name text NOT NULL,
  description text NULL,
  scoring_method text NOT NULL DEFAULT 'criteria_sum',
  attribution_mode text NOT NULL DEFAULT 'individual_judge',
  status text NOT NULL DEFAULT 'draft',
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_number_positive_check' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_number_positive_check
      CHECK (round_number >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_name_length_check' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_name_length_check
      CHECK (char_length(trim(name)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_scoring_method_check' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_scoring_method_check
      CHECK (scoring_method IN ('criteria_sum', 'criteria_weighted', 'direct_points'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_attribution_mode_check' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_attribution_mode_check
      CHECK (attribution_mode IN ('individual_judge', 'panel_consolidated', 'round_direct'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_status_check' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_status_check
      CHECK (status IN ('draft', 'ready', 'deployed', 'completed', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_event_number_unique' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_event_number_unique
      UNIQUE (event_id, round_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_id_event_unique' AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_id_event_unique
      UNIQUE (id, event_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS rounds_event_id_idx
  ON public.rounds (event_id, round_number);

DROP TRIGGER IF EXISTS set_rounds_updated_at ON public.rounds;
CREATE TRIGGER set_rounds_updated_at
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. JUDGING CRITERIA
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.judging_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds (id) ON DELETE RESTRICT,
  display_order integer NOT NULL,
  name text NOT NULL,
  max_points numeric(8,2) NOT NULL,
  weight numeric(6,2) NOT NULL DEFAULT 1.00,
  rubric_guidance text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'judging_criteria_order_positive_check' AND conrelid = 'public.judging_criteria'::regclass
  ) THEN
    ALTER TABLE public.judging_criteria
      ADD CONSTRAINT judging_criteria_order_positive_check
      CHECK (display_order >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'judging_criteria_name_length_check' AND conrelid = 'public.judging_criteria'::regclass
  ) THEN
    ALTER TABLE public.judging_criteria
      ADD CONSTRAINT judging_criteria_name_length_check
      CHECK (char_length(trim(name)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'judging_criteria_max_points_check' AND conrelid = 'public.judging_criteria'::regclass
  ) THEN
    ALTER TABLE public.judging_criteria
      ADD CONSTRAINT judging_criteria_max_points_check
      CHECK (max_points > 0 AND max_points <= 10000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'judging_criteria_weight_check' AND conrelid = 'public.judging_criteria'::regclass
  ) THEN
    ALTER TABLE public.judging_criteria
      ADD CONSTRAINT judging_criteria_weight_check
      CHECK (weight > 0 AND weight <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'judging_criteria_round_order_unique' AND conrelid = 'public.judging_criteria'::regclass
  ) THEN
    ALTER TABLE public.judging_criteria
      ADD CONSTRAINT judging_criteria_round_order_unique
      UNIQUE (round_id, display_order);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS judging_criteria_round_name_lower_uidx
  ON public.judging_criteria (round_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS judging_criteria_round_id_idx
  ON public.judging_criteria (round_id, display_order);

DROP TRIGGER IF EXISTS set_judging_criteria_updated_at ON public.judging_criteria;
CREATE TRIGGER set_judging_criteria_updated_at
  BEFORE UPDATE ON public.judging_criteria
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Protect criteria structure when the round is locked or once Stage 3 scores exist.
-- Note: Stage 3 creates the scores table; checking to_regclass('public.scores') ensures
-- enforcement works without creating a placeholder scores table in Stage 2A.
CREATE OR REPLACE FUNCTION public.prevent_criteria_mutation_when_locked_or_scored()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_round_id uuid;
  round_locked boolean;
  has_scores boolean := false;
BEGIN
  target_round_id := COALESCE(NEW.round_id, OLD.round_id);

  SELECT is_locked
  INTO round_locked
  FROM public.rounds
  WHERE id = target_round_id;

  IF round_locked IS NULL THEN
    RAISE EXCEPTION 'Target round does not exist';
  END IF;

  IF round_locked THEN
    RAISE EXCEPTION 'Judging criteria cannot be modified while the round is locked';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.round_id <> OLD.round_id THEN
    RAISE EXCEPTION 'Judging criterion cannot be moved to another round';
  END IF;

  IF to_regclass('public.scores') IS NOT NULL THEN
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM public.scores WHERE round_id = $1)'
      INTO has_scores
      USING target_round_id;

    IF has_scores THEN
      RAISE EXCEPTION 'Judging criteria structure cannot be modified once scores exist for this round';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_judging_criteria_structure ON public.judging_criteria;
CREATE TRIGGER protect_judging_criteria_structure
  BEFORE INSERT OR UPDATE OR DELETE ON public.judging_criteria
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_criteria_mutation_when_locked_or_scored();

-- ============================================================================
-- 4. CONTINGENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contingents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contingent_code text NOT NULL,
  name text NOT NULL,
  institution_name text NOT NULL,
  institution_city text NULL,
  external_registration_ref text NULL,
  contact_email text NULL,
  contact_phone text NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contingents_code_length_check' AND conrelid = 'public.contingents'::regclass
  ) THEN
    ALTER TABLE public.contingents
      ADD CONSTRAINT contingents_code_length_check
      CHECK (char_length(trim(contingent_code)) BETWEEN 2 AND 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contingents_name_length_check' AND conrelid = 'public.contingents'::regclass
  ) THEN
    ALTER TABLE public.contingents
      ADD CONSTRAINT contingents_name_length_check
      CHECK (char_length(trim(name)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contingents_institution_length_check' AND conrelid = 'public.contingents'::regclass
  ) THEN
    ALTER TABLE public.contingents
      ADD CONSTRAINT contingents_institution_length_check
      CHECK (char_length(trim(institution_name)) BETWEEN 2 AND 200);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS contingents_code_lower_uidx
  ON public.contingents (lower(trim(contingent_code)));

CREATE UNIQUE INDEX IF NOT EXISTS contingents_ext_ref_uidx
  ON public.contingents (external_registration_ref)
  WHERE external_registration_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS contingents_active_idx
  ON public.contingents (is_active, created_at DESC);

DROP TRIGGER IF EXISTS set_contingents_updated_at ON public.contingents;
CREATE TRIGGER set_contingents_updated_at
  BEFORE UPDATE ON public.contingents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 5. PARTICIPANTS (contingent_id is nullable for individual participants)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contingent_id uuid NULL REFERENCES public.contingents (id) ON DELETE RESTRICT,
  participant_code text NOT NULL,
  full_name text NOT NULL,
  email text NULL,
  phone text NULL,
  institution_name text NOT NULL,
  external_registration_ref text NULL,
  is_contingent_lead boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'participants_code_length_check' AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_code_length_check
      CHECK (char_length(trim(participant_code)) BETWEEN 2 AND 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'participants_name_length_check' AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_name_length_check
      CHECK (char_length(trim(full_name)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'participants_institution_length_check' AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_institution_length_check
      CHECK (char_length(trim(institution_name)) BETWEEN 2 AND 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'participants_lead_requires_contingent_check' AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_lead_requires_contingent_check
      CHECK (contingent_id IS NOT NULL OR is_contingent_lead = false);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS participants_code_lower_uidx
  ON public.participants (lower(trim(participant_code)));

CREATE UNIQUE INDEX IF NOT EXISTS participants_ext_ref_uidx
  ON public.participants (external_registration_ref)
  WHERE external_registration_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS participants_contingent_id_idx
  ON public.participants (contingent_id);

CREATE INDEX IF NOT EXISTS participants_active_idx
  ON public.participants (is_active, created_at DESC);

DROP TRIGGER IF EXISTS set_participants_updated_at ON public.participants;
CREATE TRIGGER set_participants_updated_at
  BEFORE UPDATE ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. EVENT ENTRIES (strict contingent XOR participant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.event_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  contingent_id uuid NULL REFERENCES public.contingents (id) ON DELETE RESTRICT,
  participant_id uuid NULL REFERENCES public.participants (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'registered',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_entries_type_check' AND conrelid = 'public.event_entries'::regclass
  ) THEN
    ALTER TABLE public.event_entries
      ADD CONSTRAINT event_entries_type_check
      CHECK (entry_type IN ('contingent', 'individual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_entries_xor_subject_check' AND conrelid = 'public.event_entries'::regclass
  ) THEN
    ALTER TABLE public.event_entries
      ADD CONSTRAINT event_entries_xor_subject_check
      CHECK (
        (entry_type = 'contingent' AND contingent_id IS NOT NULL AND participant_id IS NULL)
        OR
        (entry_type = 'individual' AND participant_id IS NOT NULL AND contingent_id IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_entries_status_check' AND conrelid = 'public.event_entries'::regclass
  ) THEN
    ALTER TABLE public.event_entries
      ADD CONSTRAINT event_entries_status_check
      CHECK (status IN ('registered', 'checked_in', 'withdrawn', 'disqualified'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS event_entries_unique_contingent_uidx
  ON public.event_entries (event_id, contingent_id)
  WHERE contingent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_entries_unique_participant_uidx
  ON public.event_entries (event_id, participant_id)
  WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_entries_event_id_idx
  ON public.event_entries (event_id, created_at DESC);

DROP TRIGGER IF EXISTS set_event_entries_updated_at ON public.event_entries;
CREATE TRIGGER set_event_entries_updated_at
  BEFORE UPDATE ON public.event_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_event_entry_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_entry_mode text;
  target_event_status text;
  subject_active boolean;
BEGIN
  SELECT entry_mode, status
  INTO target_entry_mode, target_event_status
  FROM public.events
  WHERE id = NEW.event_id;

  IF target_entry_mode IS NULL THEN
    RAISE EXCEPTION 'Referenced event does not exist';
  END IF;

  IF TG_OP = 'INSERT' AND target_event_status = 'archived' THEN
    RAISE EXCEPTION 'Cannot register new entries into an archived event';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id <> OLD.event_id THEN
      RAISE EXCEPTION 'Event entry cannot be moved across events';
    END IF;
    IF NEW.entry_type <> OLD.entry_type
       OR NEW.contingent_id IS DISTINCT FROM OLD.contingent_id
       OR NEW.participant_id IS DISTINCT FROM OLD.participant_id THEN
      RAISE EXCEPTION 'Event entry subject cannot be changed after creation';
    END IF;
  END IF;

  IF target_entry_mode = 'contingent' AND NEW.entry_type <> 'contingent' THEN
    RAISE EXCEPTION 'This event accepts contingent entries only';
  END IF;

  IF target_entry_mode = 'individual' AND NEW.entry_type <> 'individual' THEN
    RAISE EXCEPTION 'This event accepts individual participant entries only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.entry_type = 'contingent' THEN
      SELECT is_active INTO subject_active
      FROM public.contingents
      WHERE id = NEW.contingent_id;

      IF subject_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Contingent must exist and be active to enter an event';
      END IF;
    ELSE
      SELECT is_active INTO subject_active
      FROM public.participants
      WHERE id = NEW.participant_id;

      IF subject_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Participant must exist and be active to enter an event';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_event_entry_compatibility ON public.event_entries;
CREATE TRIGGER enforce_event_entry_compatibility
  BEFORE INSERT OR UPDATE ON public.event_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_event_entry_compatibility();

-- ============================================================================
-- 7. TRANSACTIONAL ORDERING RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reorder_event_rounds(
  p_event_id uuid,
  p_round_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  expected_count integer;
  matched_count integer;
  idx integer;
BEGIN
  IF NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT count(*) INTO expected_count
  FROM public.rounds
  WHERE event_id = p_event_id;

  SELECT count(*) INTO matched_count
  FROM public.rounds
  WHERE event_id = p_event_id
    AND id = ANY(p_round_ids);

  IF expected_count = 0 OR expected_count <> array_length(p_round_ids, 1) OR matched_count <> expected_count THEN
    RAISE EXCEPTION 'Round list must include every round belonging to this event without cross-event references';
  END IF;

  UPDATE public.rounds
  SET round_number = round_number + 100000
  WHERE event_id = p_event_id;

  FOR idx IN 1..array_length(p_round_ids, 1) LOOP
    UPDATE public.rounds
    SET round_number = idx
    WHERE id = p_round_ids[idx]
      AND event_id = p_event_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_round_criteria(
  p_round_id uuid,
  p_criterion_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  expected_count integer;
  matched_count integer;
  idx integer;
BEGIN
  IF NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT count(*) INTO expected_count
  FROM public.judging_criteria
  WHERE round_id = p_round_id;

  SELECT count(*) INTO matched_count
  FROM public.judging_criteria
  WHERE round_id = p_round_id
    AND id = ANY(p_criterion_ids);

  IF expected_count = 0 OR expected_count <> array_length(p_criterion_ids, 1) OR matched_count <> expected_count THEN
    RAISE EXCEPTION 'Criteria list must include every criterion belonging to this round';
  END IF;

  UPDATE public.judging_criteria
  SET display_order = display_order + 100000
  WHERE round_id = p_round_id;

  FOR idx IN 1..array_length(p_criterion_ids, 1) LOOP
    UPDATE public.judging_criteria
    SET display_order = idx
    WHERE id = p_criterion_ids[idx]
      AND round_id = p_round_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_event_rounds(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_event_rounds(uuid, uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.reorder_round_criteria(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_round_criteria(uuid, uuid[]) TO authenticated;

-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES (active organisers only; zero anon access)
-- ============================================================================
REVOKE ALL ON public.events FROM anon;
REVOKE ALL ON public.rounds FROM anon;
REVOKE ALL ON public.judging_criteria FROM anon;
REVOKE ALL ON public.contingents FROM anon;
REVOKE ALL ON public.participants FROM anon;
REVOKE ALL ON public.event_entries FROM anon;

-- Prevent accidental deletion of core competition & registry entities
REVOKE DELETE ON public.events FROM authenticated;
REVOKE DELETE ON public.rounds FROM authenticated;
REVOKE DELETE ON public.contingents FROM authenticated;
REVOKE DELETE ON public.participants FROM authenticated;
REVOKE DELETE ON public.event_entries FROM authenticated;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judging_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contingents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;

-- events policies
DROP POLICY IF EXISTS events_select_active_organiser ON public.events;
CREATE POLICY events_select_active_organiser
  ON public.events FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS events_insert_active_organiser ON public.events;
CREATE POLICY events_insert_active_organiser
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS events_update_active_organiser ON public.events;
CREATE POLICY events_update_active_organiser
  ON public.events FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

-- rounds policies
DROP POLICY IF EXISTS rounds_select_active_organiser ON public.rounds;
CREATE POLICY rounds_select_active_organiser
  ON public.rounds FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS rounds_insert_active_organiser ON public.rounds;
CREATE POLICY rounds_insert_active_organiser
  ON public.rounds FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS rounds_update_active_organiser ON public.rounds;
CREATE POLICY rounds_update_active_organiser
  ON public.rounds FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

-- judging_criteria policies (DELETE permitted only while round unlocked & unscored, enforced by trigger)
DROP POLICY IF EXISTS criteria_select_active_organiser ON public.judging_criteria;
CREATE POLICY criteria_select_active_organiser
  ON public.judging_criteria FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS criteria_insert_active_organiser ON public.judging_criteria;
CREATE POLICY criteria_insert_active_organiser
  ON public.judging_criteria FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS criteria_update_active_organiser ON public.judging_criteria;
CREATE POLICY criteria_update_active_organiser
  ON public.judging_criteria FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS criteria_delete_active_organiser ON public.judging_criteria;
CREATE POLICY criteria_delete_active_organiser
  ON public.judging_criteria FOR DELETE TO authenticated
  USING (public.is_active_organiser());

-- contingents policies
DROP POLICY IF EXISTS contingents_select_active_organiser ON public.contingents;
CREATE POLICY contingents_select_active_organiser
  ON public.contingents FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS contingents_insert_active_organiser ON public.contingents;
CREATE POLICY contingents_insert_active_organiser
  ON public.contingents FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS contingents_update_active_organiser ON public.contingents;
CREATE POLICY contingents_update_active_organiser
  ON public.contingents FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

-- participants policies
DROP POLICY IF EXISTS participants_select_active_organiser ON public.participants;
CREATE POLICY participants_select_active_organiser
  ON public.participants FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS participants_insert_active_organiser ON public.participants;
CREATE POLICY participants_insert_active_organiser
  ON public.participants FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS participants_update_active_organiser ON public.participants;
CREATE POLICY participants_update_active_organiser
  ON public.participants FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

-- event_entries policies
DROP POLICY IF EXISTS event_entries_select_active_organiser ON public.event_entries;
CREATE POLICY event_entries_select_active_organiser
  ON public.event_entries FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS event_entries_insert_active_organiser ON public.event_entries;
CREATE POLICY event_entries_insert_active_organiser
  ON public.event_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS event_entries_update_active_organiser ON public.event_entries;
CREATE POLICY event_entries_update_active_organiser
  ON public.event_entries FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

