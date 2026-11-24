-- Stage 2C Migration 0007: Round Release Management, Release Session History, and Read-Time Expiry Enforcement
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (events, rounds, rounds_id_event_unique)
-- Additive only. Does NOT modify Stage 2A/2B tables except extending rounds for Stage 2C.

-- ============================================================================
-- 1. EXTEND PUBLIC.ROUNDS WITH DURATION_MINUTES AND 'closed' STATUS
-- ============================================================================
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS duration_minutes integer NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_status_check'
      AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      DROP CONSTRAINT rounds_status_check;
  END IF;

  ALTER TABLE public.rounds
    ADD CONSTRAINT rounds_status_check
    CHECK (status IN ('draft', 'ready', 'deployed', 'closed', 'completed', 'archived'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rounds_duration_minutes_check'
      AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_duration_minutes_check
      CHECK (duration_minutes IS NULL OR (duration_minutes BETWEEN 1 AND 1440));
  END IF;
END
$$;

-- ============================================================================
-- 2. TIMESTAMPTZ-CONSISTENT UPDATED_AT HELPER & ROUND RELEASE SESSIONS TABLE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_round_release_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.round_release_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  round_id uuid NOT NULL,
  session_number integer NOT NULL,
  duration_minutes integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz NULL,
  close_reason text NULL,
  released_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  closed_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT round_release_sessions_round_event_fkey
    FOREIGN KEY (round_id, event_id)
    REFERENCES public.rounds (id, event_id)
    ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'round_release_sessions_number_positive_check'
      AND conrelid = 'public.round_release_sessions'::regclass
  ) THEN
    ALTER TABLE public.round_release_sessions
      ADD CONSTRAINT round_release_sessions_number_positive_check
      CHECK (session_number >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'round_release_sessions_duration_check'
      AND conrelid = 'public.round_release_sessions'::regclass
  ) THEN
    ALTER TABLE public.round_release_sessions
      ADD CONSTRAINT round_release_sessions_duration_check
      CHECK (duration_minutes BETWEEN 1 AND 1440);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'round_release_sessions_expires_after_start_check'
      AND conrelid = 'public.round_release_sessions'::regclass
  ) THEN
    ALTER TABLE public.round_release_sessions
      ADD CONSTRAINT round_release_sessions_expires_after_start_check
      CHECK (expires_at > started_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'round_release_sessions_closed_after_start_check'
      AND conrelid = 'public.round_release_sessions'::regclass
  ) THEN
    ALTER TABLE public.round_release_sessions
      ADD CONSTRAINT round_release_sessions_closed_after_start_check
      CHECK (closed_at IS NULL OR closed_at >= started_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'round_release_sessions_close_consistency_check'
      AND conrelid = 'public.round_release_sessions'::regclass
  ) THEN
    ALTER TABLE public.round_release_sessions
      ADD CONSTRAINT round_release_sessions_close_consistency_check
      CHECK (
        (closed_at IS NULL AND close_reason IS NULL AND closed_by IS NULL)
        OR (
          closed_at IS NOT NULL
          AND close_reason IS NOT NULL
          AND close_reason IN ('manual', 'expired')
          AND (
            (close_reason = 'expired' AND closed_by IS NULL AND closed_at = expires_at)
            OR (
              close_reason = 'manual'
              AND closed_by IS NOT NULL
              AND closed_at >= started_at
              AND closed_at < expires_at
            )
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'round_release_sessions_round_session_unique'
      AND conrelid = 'public.round_release_sessions'::regclass
  ) THEN
    ALTER TABLE public.round_release_sessions
      ADD CONSTRAINT round_release_sessions_round_session_unique
      UNIQUE (round_id, session_number);
  END IF;
END
$$;

-- Enforce at most ONE open release session per round concurrently
CREATE UNIQUE INDEX IF NOT EXISTS round_release_sessions_one_open_uidx
  ON public.round_release_sessions (round_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS round_release_sessions_event_round_idx
  ON public.round_release_sessions (event_id, round_id, session_number DESC);

CREATE INDEX IF NOT EXISTS round_release_sessions_active_lookup_idx
  ON public.round_release_sessions (round_id, closed_at, expires_at);

DROP TRIGGER IF EXISTS set_round_release_sessions_updated_at ON public.round_release_sessions;
CREATE TRIGGER set_round_release_sessions_updated_at
  BEFORE UPDATE ON public.round_release_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_round_release_updated_at();

-- ============================================================================
-- 3. IMMUTABILITY & LIFECYCLE PROTECTION TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_round_release_session_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Release session history records are immutable and cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Closed release sessions are immutable and cannot be modified';
    END IF;

    IF NEW.id <> OLD.id
       OR NEW.event_id <> OLD.event_id
       OR NEW.round_id <> OLD.round_id
       OR NEW.session_number <> OLD.session_number
       OR NEW.duration_minutes <> OLD.duration_minutes
       OR NEW.started_at <> OLD.started_at
       OR NEW.expires_at <> OLD.expires_at
       OR NEW.released_by IS DISTINCT FROM OLD.released_by
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Release session identity, duration, and timing fields are immutable';
    END IF;

    IF NEW.closed_at IS NULL OR NEW.close_reason IS NULL THEN
      RAISE EXCEPTION 'An open release session can only transition once from open to closed';
    END IF;

    IF NEW.close_reason = 'expired' THEN
      IF NEW.closed_at <> OLD.expires_at OR NEW.closed_by IS NOT NULL THEN
        RAISE EXCEPTION 'Automatic expiry closure must record closed_at equal to expires_at with null closed_by';
      END IF;
    ELSIF NEW.close_reason = 'manual' THEN
      IF NEW.closed_at < OLD.started_at
         OR NEW.closed_at >= OLD.expires_at
         OR NEW.closed_by IS NULL THEN
        RAISE EXCEPTION 'Manual closure must occur before expiry and attribute closed_by';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid close_reason "%"', NEW.close_reason;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_round_release_session_history ON public.round_release_sessions;
CREATE TRIGGER protect_round_release_session_history
  BEFORE UPDATE OR DELETE ON public.round_release_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_round_release_session_immutability();

-- Protect rounds against direct authenticated release-state tampering or silent unlocking.
-- Uses PostgreSQL current_user privilege separation + cross-table session invariants
-- (no client-settable custom PostgreSQL GUC setting bypass).
CREATE OR REPLACE FUNCTION public.protect_round_release_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_open_session boolean;
  v_has_any_session boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('deployed', 'closed') THEN
      RAISE EXCEPTION 'Rounds cannot be created directly in "%" status; prepare as draft or ready first', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.event_id <> OLD.event_id THEN
    RAISE EXCEPTION 'Round cannot be moved across events';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.round_release_sessions s
      WHERE s.round_id = OLD.id
        AND s.closed_at IS NULL
    ),
    EXISTS (
      SELECT 1
      FROM public.round_release_sessions s
      WHERE s.round_id = OLD.id
    )
  INTO v_has_open_session, v_has_any_session;

  -- Once released, judging criteria lock must never be silently removed
  IF OLD.is_locked = true
     AND NEW.is_locked = false
     AND (v_has_any_session OR OLD.status IN ('deployed', 'closed')) THEN
    RAISE EXCEPTION 'Judging criteria lock cannot be removed after a round has been released';
  END IF;

  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('deployed', 'closed') THEN
        RAISE EXCEPTION 'Round status "%" can only be changed through release management actions', NEW.status;
      END IF;

      IF OLD.status = 'deployed' THEN
        RAISE EXCEPTION 'A deployed round cannot change status directly; close the active release first';
      END IF;

      IF OLD.status = 'closed' AND NEW.status IN ('draft', 'ready') THEN
        RAISE EXCEPTION 'A closed round cannot return to "%" directly; use Reopen to start a new release session', NEW.status;
      END IF;
    END IF;

    IF v_has_any_session AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
      RAISE EXCEPTION 'Round duration cannot be modified after release history exists; override duration only when reopening the round';
    END IF;
  ELSE
    -- Structural invariants enforced even for privileged callers
    IF v_has_any_session AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
      IF NEW.status <> 'deployed'
         OR NOT EXISTS (
           SELECT 1
           FROM public.round_release_sessions s
           WHERE s.round_id = OLD.id
             AND s.closed_at IS NULL
             AND s.duration_minutes = NEW.duration_minutes
         ) THEN
        RAISE EXCEPTION 'Round duration cannot be modified after release history exists except when creating a new session via reopen';
      END IF;
    END IF;

    IF NEW.status = 'deployed' AND NOT v_has_open_session THEN
      RAISE EXCEPTION 'Round status "deployed" requires an open release session';
    END IF;

    IF NEW.status = 'deployed' AND NEW.is_locked IS NOT TRUE THEN
      RAISE EXCEPTION 'A deployed round must have is_locked = true';
    END IF;

    IF NEW.status = 'closed' AND (v_has_open_session OR NOT v_has_any_session) THEN
      RAISE EXCEPTION 'Round status "closed" requires a closed release session and no open release session';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_round_release_lifecycle ON public.rounds;
CREATE TRIGGER enforce_round_release_lifecycle
  BEFORE INSERT OR UPDATE ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_round_release_lifecycle();

-- Race-safe database enforcement preventing an active event from transitioning away
-- from 'active' while any round has an unexpired open release session.
-- Shares lock order (events tuple lock -> event advisory lock) with release/reopen RPCs.
CREATE OR REPLACE FUNCTION public.protect_event_release_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_has_live_session boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'active' THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('virtuoso_event_release:' || NEW.id::text)
    );

    v_now := clock_timestamp();

    SELECT EXISTS (
      SELECT 1
      FROM public.round_release_sessions s
      WHERE s.event_id = NEW.id
        AND s.closed_at IS NULL
        AND s.expires_at > v_now
    )
    INTO v_has_live_session;

    IF v_has_live_session THEN
      RAISE EXCEPTION 'Cannot change event status away from "active" while a round has an unexpired open release session';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_event_release_deactivation ON public.events;
CREATE TRIGGER enforce_event_release_deactivation
  BEFORE UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_event_release_deactivation();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (Organiser SELECT Only; Mutations via Protected RPCs)
-- ============================================================================
REVOKE ALL ON public.round_release_sessions FROM PUBLIC;
REVOKE ALL ON public.round_release_sessions FROM anon;
REVOKE ALL ON public.round_release_sessions FROM authenticated;
GRANT SELECT ON public.round_release_sessions TO authenticated;

ALTER TABLE public.round_release_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS round_release_sessions_select_active_organiser ON public.round_release_sessions;
CREATE POLICY round_release_sessions_select_active_organiser
  ON public.round_release_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_active_organiser());

-- ============================================================================
-- 5. READ-TIME TEAM VISIBILITY PREDICATE & SERVER CLOCK HELPER
-- ============================================================================
-- Always checks statement_timestamp() against the actual open release session,
-- never relying merely on rounds.status = 'deployed'.
CREATE OR REPLACE FUNCTION public.is_round_currently_live_for_teams(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rounds r
    JOIN public.events e
      ON e.id = r.event_id
    JOIN public.round_release_sessions s
      ON s.round_id = r.id
     AND s.event_id = r.event_id
    WHERE r.id = p_round_id
      AND e.status = 'active'
      AND r.status = 'deployed'
      AND s.closed_at IS NULL
      AND statement_timestamp() >= s.started_at
      AND statement_timestamp() < s.expires_at
  );
$$;

REVOKE ALL ON FUNCTION public.is_round_currently_live_for_teams(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_round_currently_live_for_teams(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_db_server_timestamp()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT statement_timestamp();
$$;

REVOKE ALL ON FUNCTION public.get_db_server_timestamp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_server_timestamp() TO authenticated;

-- ============================================================================
-- 6. CONCURRENCY-SAFE DURATION / RELEASE / CLOSE / REOPEN / RECONCILE RPCs
--    Global Lock Order:
--      1. public.events row lock (FOR SHARE)
--      2. event advisory lock ('virtuoso_event_release:' || event_id)
--      3. round advisory lock ('virtuoso_round_release:' || round_id)
--      4. public.rounds row lock (FOR UPDATE)
--      5. public.round_release_sessions open row lock (FOR UPDATE)
--    clock_timestamp() is captured ONLY AFTER all required locks are held.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.configure_round_duration(
  p_event_id uuid,
  p_round_id uuid,
  p_duration_minutes integer
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
  v_round record;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_round_id IS NULL THEN
    RAISE EXCEPTION 'Event and round identifiers are required';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'Round duration must be a whole number between 1 and 1,440 minutes';
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
    hashtext('virtuoso_event_release:' || p_event_id::text)
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_round_release:' || p_round_id::text)
  );

  SELECT id, event_id, round_number, status, duration_minutes
  INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target round does not belong to this event';
  END IF;

  IF v_round.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Cannot configure release duration for a "%" round', v_round.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.round_release_sessions s
    WHERE s.round_id = p_round_id
  ) THEN
    RAISE EXCEPTION 'Round duration cannot be modified after release history exists; override duration only when reopening the round';
  END IF;

  v_now := clock_timestamp();

  UPDATE public.rounds
  SET duration_minutes = p_duration_minutes
  WHERE id = p_round_id
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
    'round.duration_configured',
    'round',
    p_round_id::text,
    jsonb_build_object('duration_minutes', v_round.duration_minutes),
    jsonb_build_object('duration_minutes', p_duration_minutes),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'round_number', v_round.round_number,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'round_id', p_round_id,
    'duration_minutes', p_duration_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_round(
  p_event_id uuid,
  p_round_id uuid,
  p_duration_minutes integer DEFAULT NULL,
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
  v_round record;
  v_duration integer;
  v_clean_notes text;
  v_expires_at timestamptz;
  v_session public.round_release_sessions%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_round_id IS NULL THEN
    RAISE EXCEPTION 'Event and round identifiers are required';
  END IF;

  -- Lock order: events FOR SHARE -> event advisory -> round advisory -> rounds FOR UPDATE
  SELECT id, code, name, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_event_release:' || p_event_id::text)
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_round_release:' || p_round_id::text)
  );

  SELECT id, event_id, round_number, name, status, is_locked, duration_minutes
  INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target round does not belong to this event';
  END IF;

  -- All locks are held; capture authoritative timestamp and re-verify event status
  v_now := clock_timestamp();
  v_clean_notes := NULLIF(trim(COALESCE(p_notes, '')), '');

  IF v_event.status <> 'active' THEN
    RAISE EXCEPTION 'Parent event must have status "active" before a round can be released';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.round_release_sessions s
    WHERE s.round_id = p_round_id
  ) THEN
    RAISE EXCEPTION 'This round already has release history; use Reopen to start a new release session';
  END IF;

  IF v_round.status <> 'ready' THEN
    RAISE EXCEPTION 'Round must be explicitly marked "ready" before its first release (current status: "%")', v_round.status;
  END IF;

  v_duration := COALESCE(p_duration_minutes, v_round.duration_minutes);
  IF v_duration IS NULL OR v_duration < 1 OR v_duration > 1440 THEN
    RAISE EXCEPTION 'Round duration must be configured as a whole number between 1 and 1,440 minutes before release';
  END IF;

  v_expires_at := v_now + make_interval(mins => v_duration);

  INSERT INTO public.round_release_sessions (
    event_id,
    round_id,
    session_number,
    duration_minutes,
    started_at,
    expires_at,
    released_by,
    notes
  )
  VALUES (
    p_event_id,
    p_round_id,
    1,
    v_duration,
    v_now,
    v_expires_at,
    v_actor_id,
    v_clean_notes
  )
  RETURNING * INTO v_session;

  UPDATE public.rounds
  SET
    status = 'deployed',
    is_locked = true,
    duration_minutes = v_duration
  WHERE id = p_round_id
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
    'round.released',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'status', v_round.status,
      'is_locked', v_round.is_locked,
      'duration_minutes', v_round.duration_minutes
    ),
    jsonb_build_object(
      'status', 'deployed',
      'is_locked', true,
      'duration_minutes', v_duration,
      'session_id', v_session.id,
      'session_number', v_session.session_number,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'round_number', v_round.round_number,
      'notes', v_clean_notes,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'released',
    'session_id', v_session.id,
    'session_number', v_session.session_number,
    'duration_minutes', v_session.duration_minutes,
    'started_at', v_session.started_at,
    'expires_at', v_session.expires_at,
    'round_status', 'deployed',
    'is_locked', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_round_release(
  p_event_id uuid,
  p_round_id uuid,
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
  v_round record;
  v_open public.round_release_sessions%ROWTYPE;
  v_clean_notes text;
  v_merged_notes text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_round_id IS NULL THEN
    RAISE EXCEPTION 'Event and round identifiers are required';
  END IF;

  -- Lock order: events FOR SHARE -> event adv -> round adv -> rounds FOR UPDATE -> open session FOR UPDATE
  SELECT id, code, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_event_release:' || p_event_id::text)
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_round_release:' || p_round_id::text)
  );

  SELECT id, event_id, round_number, status, is_locked, duration_minutes
  INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target round does not belong to this event';
  END IF;

  SELECT *
  INTO v_open
  FROM public.round_release_sessions
  WHERE round_id = p_round_id
    AND event_id = p_event_id
    AND closed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This round does not have an open release session to close';
  END IF;

  -- Capture clock_timestamp() only after locking the open session row
  v_now := clock_timestamp();
  v_clean_notes := NULLIF(trim(COALESCE(p_notes, '')), '');

  IF v_open.expires_at <= v_now THEN
    UPDATE public.round_release_sessions
    SET
      closed_at = v_open.expires_at,
      close_reason = 'expired',
      closed_by = NULL
    WHERE id = v_open.id;

    UPDATE public.rounds
    SET status = 'closed'
    WHERE id = p_round_id
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
      'round.release_expired',
      'round',
      p_round_id::text,
      jsonb_build_object(
        'status', v_round.status,
        'session_id', v_open.id,
        'session_number', v_open.session_number,
        'closed_at', NULL
      ),
      jsonb_build_object(
        'status', 'closed',
        'is_locked', v_round.is_locked,
        'session_id', v_open.id,
        'session_number', v_open.session_number,
        'closed_at', v_open.expires_at,
        'close_reason', 'expired'
      ),
      jsonb_build_object(
        'event_id', p_event_id,
        'event_code', v_event.code,
        'round_number', v_round.round_number,
        'reconciled_at', v_now,
        'timestamp', v_now
      )
    );

    RETURN jsonb_build_object(
      'operation', 'already_expired',
      'session_id', v_open.id,
      'session_number', v_open.session_number,
      'closed_at', v_open.expires_at,
      'close_reason', 'expired',
      'round_status', 'closed',
      'is_locked', v_round.is_locked
    );
  END IF;

  v_merged_notes := COALESCE(v_clean_notes, v_open.notes);

  UPDATE public.round_release_sessions
  SET
    closed_at = v_now,
    close_reason = 'manual',
    closed_by = v_actor_id,
    notes = v_merged_notes
  WHERE id = v_open.id;

  UPDATE public.rounds
  SET status = 'closed'
  WHERE id = p_round_id
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
    'round.closed_manually',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'status', v_round.status,
      'session_id', v_open.id,
      'session_number', v_open.session_number,
      'closed_at', NULL
    ),
    jsonb_build_object(
      'status', 'closed',
      'is_locked', v_round.is_locked,
      'session_id', v_open.id,
      'session_number', v_open.session_number,
      'closed_at', v_now,
      'close_reason', 'manual'
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'round_number', v_round.round_number,
      'notes', v_clean_notes,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'closed_manually',
    'session_id', v_open.id,
    'session_number', v_open.session_number,
    'closed_at', v_now,
    'close_reason', 'manual',
    'round_status', 'closed',
    'is_locked', v_round.is_locked
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_round_release(
  p_event_id uuid,
  p_round_id uuid,
  p_confirm_reopen boolean DEFAULT false,
  p_duration_minutes integer DEFAULT NULL,
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
  v_round record;
  v_open public.round_release_sessions%ROWTYPE;
  v_max_session integer;
  v_next_session integer;
  v_duration integer;
  v_clean_notes text;
  v_expires_at timestamptz;
  v_session public.round_release_sessions%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  IF NOT COALESCE(p_confirm_reopen, false) THEN
    RAISE EXCEPTION 'Explicit confirmation is required before reopening a closed round';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_round_id IS NULL THEN
    RAISE EXCEPTION 'Event and round identifiers are required';
  END IF;

  -- Lock order: events FOR SHARE -> event adv -> round adv -> rounds FOR UPDATE -> open session FOR UPDATE
  SELECT id, code, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_event_release:' || p_event_id::text)
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_round_release:' || p_round_id::text)
  );

  SELECT id, event_id, round_number, status, is_locked, duration_minutes
  INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target round does not belong to this event';
  END IF;

  SELECT *
  INTO v_open
  FROM public.round_release_sessions
  WHERE round_id = p_round_id
    AND event_id = p_event_id
    AND closed_at IS NULL
  FOR UPDATE;

  -- All locks held; capture authoritative timestamp
  v_now := clock_timestamp();
  v_clean_notes := NULLIF(trim(COALESCE(p_notes, '')), '');

  IF v_event.status <> 'active' THEN
    RAISE EXCEPTION 'Parent event must have status "active" before a round can be reopened';
  END IF;

  IF v_round.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Rounds with status "%" cannot be reopened', v_round.status;
  END IF;

  IF v_open.id IS NOT NULL THEN
    IF v_open.expires_at > v_now THEN
      RAISE EXCEPTION 'Round is currently live until %; close it before reopening', v_open.expires_at;
    END IF;

    UPDATE public.round_release_sessions
    SET
      closed_at = v_open.expires_at,
      close_reason = 'expired',
      closed_by = NULL
    WHERE id = v_open.id;

    UPDATE public.rounds
    SET status = 'closed'
    WHERE id = p_round_id
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
      'round.release_expired',
      'round',
      p_round_id::text,
      jsonb_build_object(
        'status', v_round.status,
        'session_id', v_open.id,
        'session_number', v_open.session_number,
        'closed_at', NULL
      ),
      jsonb_build_object(
        'status', 'closed',
        'is_locked', v_round.is_locked,
        'session_id', v_open.id,
        'session_number', v_open.session_number,
        'closed_at', v_open.expires_at,
        'close_reason', 'expired'
      ),
      jsonb_build_object(
        'event_id', p_event_id,
        'event_code', v_event.code,
        'round_number', v_round.round_number,
        'reconciled_at', v_now,
        'timestamp', v_now
      )
    );

    v_round.status := 'closed';
  END IF;

  SELECT COALESCE(MAX(session_number), 0)
  INTO v_max_session
  FROM public.round_release_sessions
  WHERE round_id = p_round_id
    AND event_id = p_event_id;

  IF v_max_session < 1 OR v_round.status <> 'closed' THEN
    RAISE EXCEPTION 'Only a previously released and closed round can be reopened';
  END IF;

  v_duration := COALESCE(p_duration_minutes, v_round.duration_minutes);
  IF v_duration IS NULL OR v_duration < 1 OR v_duration > 1440 THEN
    RAISE EXCEPTION 'Round duration must be between 1 and 1,440 whole minutes';
  END IF;

  v_next_session := v_max_session + 1;
  v_expires_at := v_now + make_interval(mins => v_duration);

  INSERT INTO public.round_release_sessions (
    event_id,
    round_id,
    session_number,
    duration_minutes,
    started_at,
    expires_at,
    released_by,
    notes
  )
  VALUES (
    p_event_id,
    p_round_id,
    v_next_session,
    v_duration,
    v_now,
    v_expires_at,
    v_actor_id,
    v_clean_notes
  )
  RETURNING * INTO v_session;

  UPDATE public.rounds
  SET
    status = 'deployed',
    is_locked = true,
    duration_minutes = v_duration
  WHERE id = p_round_id
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
    'round.reopened',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'status', v_round.status,
      'is_locked', v_round.is_locked,
      'duration_minutes', v_round.duration_minutes,
      'previous_session_number', v_max_session
    ),
    jsonb_build_object(
      'status', 'deployed',
      'is_locked', true,
      'duration_minutes', v_duration,
      'session_id', v_session.id,
      'session_number', v_session.session_number,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'round_number', v_round.round_number,
      'confirmed_reopen', true,
      'notes', v_clean_notes,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'operation', 'reopened',
    'session_id', v_session.id,
    'session_number', v_session.session_number,
    'duration_minutes', v_session.duration_minutes,
    'started_at', v_session.started_at,
    'expires_at', v_session.expires_at,
    'round_status', 'deployed',
    'is_locked', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_expired_round_release(
  p_event_id uuid,
  p_round_id uuid
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
  v_round record;
  v_open public.round_release_sessions%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  IF p_event_id IS NULL OR p_round_id IS NULL THEN
    RAISE EXCEPTION 'Event and round identifiers are required';
  END IF;

  -- Lock order: events FOR SHARE -> event adv -> round adv -> rounds FOR UPDATE -> open session FOR UPDATE
  SELECT id, code
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_event_release:' || p_event_id::text)
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('virtuoso_round_release:' || p_round_id::text)
  );

  SELECT id, event_id, round_number, status, is_locked
  INTO v_round
  FROM public.rounds
  WHERE id = p_round_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target round does not belong to this event';
  END IF;

  SELECT *
  INTO v_open
  FROM public.round_release_sessions
  WHERE round_id = p_round_id
    AND event_id = p_event_id
    AND closed_at IS NULL
  FOR UPDATE;

  -- Capture clock_timestamp() only after locking the open session row
  v_now := clock_timestamp();

  IF v_open.id IS NULL OR v_open.expires_at > v_now THEN
    RETURN jsonb_build_object(
      'reconciled', false,
      'round_status', v_round.status
    );
  END IF;

  UPDATE public.round_release_sessions
  SET
    closed_at = v_open.expires_at,
    close_reason = 'expired',
    closed_by = NULL
  WHERE id = v_open.id;

  UPDATE public.rounds
  SET status = 'closed'
  WHERE id = p_round_id
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
    'round.release_expired',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'status', v_round.status,
      'session_id', v_open.id,
      'session_number', v_open.session_number,
      'closed_at', NULL
    ),
    jsonb_build_object(
      'status', 'closed',
      'is_locked', v_round.is_locked,
      'session_id', v_open.id,
      'session_number', v_open.session_number,
      'closed_at', v_open.expires_at,
      'close_reason', 'expired'
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_code', v_event.code,
      'round_number', v_round.round_number,
      'reconciled_at', v_now,
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object(
    'reconciled', true,
    'session_id', v_open.id,
    'session_number', v_open.session_number,
    'closed_at', v_open.expires_at,
    'close_reason', 'expired',
    'round_status', 'closed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_round_duration(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_round_duration(uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.release_round(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_round(uuid, uuid, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.close_round_release(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_round_release(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reopen_round_release(uuid, uuid, boolean, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_round_release(uuid, uuid, boolean, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reconcile_expired_round_release(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_round_release(uuid, uuid) TO authenticated;
