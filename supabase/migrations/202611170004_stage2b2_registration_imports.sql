-- Stage 2B.2 Migration 0004: Safe registration import execution RPC and persistent import history
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, is_active_organiser)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (events, contingents, participants, event_entries)
-- Additive only. Does NOT modify Stage 1B or Stage 2A tables, triggers, or existing records.

-- ============================================================================
-- 1. PERSISTENT IMPORT HISTORY TABLE (no raw spreadsheets or unnecessary PII)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.registration_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  initiated_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  initiated_by_email text NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  source_filename text NOT NULL,
  file_format text NOT NULL,
  status text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  created_contingents_count integer NOT NULL DEFAULT 0,
  created_participants_count integer NOT NULL DEFAULT 0,
  created_entries_count integer NOT NULL DEFAULT 0,
  reused_records_count integer NOT NULL DEFAULT 0,
  updated_records_count integer NOT NULL DEFAULT 0,
  skipped_rows_count integer NOT NULL DEFAULT 0,
  rejected_rows_count integer NOT NULL DEFAULT 0,
  missing_from_file_count integer NOT NULL DEFAULT 0,
  error_summary text NULL,
  summary_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_status_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_status_check
      CHECK (status IN ('completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_format_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_format_check
      CHECK (file_format IN ('csv', 'xlsx'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_idempotency_len_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_idempotency_len_check
      CHECK (char_length(trim(idempotency_key)) BETWEEN 8 AND 128);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_payload_hash_len_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_payload_hash_len_check
      CHECK (char_length(trim(payload_hash)) = 64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_filename_len_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_filename_len_check
      CHECK (char_length(trim(source_filename)) BETWEEN 1 AND 255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_counts_non_negative_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_counts_non_negative_check
      CHECK (
        total_rows >= 0
        AND created_contingents_count >= 0
        AND created_participants_count >= 0
        AND created_entries_count >= 0
        AND reused_records_count >= 0
        AND updated_records_count >= 0
        AND skipped_rows_count >= 0
        AND rejected_rows_count >= 0
        AND missing_from_file_count >= 0
      );
  END IF;
END
$$;

-- Prevent duplicate execution of any completed import with the same idempotency key per event
CREATE UNIQUE INDEX IF NOT EXISTS registration_imports_completed_idempotency_uidx
  ON public.registration_imports (event_id, idempotency_key)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS registration_imports_event_created_idx
  ON public.registration_imports (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS registration_imports_initiator_created_idx
  ON public.registration_imports (initiated_by, created_at DESC);

-- Immutable history: ordinary users and updates/deletes must never alter past import records
CREATE OR REPLACE FUNCTION public.prevent_registration_import_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'registration_imports history records are immutable and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS enforce_registration_imports_immutable ON public.registration_imports;
CREATE TRIGGER enforce_registration_imports_immutable
  BEFORE UPDATE OR DELETE ON public.registration_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_registration_import_mutation();

REVOKE ALL ON public.registration_imports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.registration_imports FROM authenticated;

ALTER TABLE public.registration_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registration_imports_select_active_organiser ON public.registration_imports;
CREATE POLICY registration_imports_select_active_organiser
  ON public.registration_imports
  FOR SELECT
  TO authenticated
  USING (public.is_active_organiser());

-- ============================================================================
-- 2. ATOMIC REGISTRATION IMPORT EXECUTION RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.execute_registration_import(
  p_event_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_source_filename text,
  p_file_format text,
  p_summary_meta jsonb,
  p_contingent_ops jsonb,
  p_participant_ops jsonb,
  p_entry_ops jsonb
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
  v_existing_import record;
  v_clean_idempotency text;
  v_clean_hash text;
  v_clean_filename text;
  v_clean_format text;

  v_contingent_ids jsonb := '{}'::jsonb;
  v_participant_ids jsonb := '{}'::jsonb;

  v_op jsonb;
  v_op_type text;
  v_existing_id uuid;
  v_code text;
  v_code_key text;
  v_name text;
  v_institution text;
  v_city text;
  v_ext_ref text;
  v_contact_email text;
  v_contact_phone text;
  v_notes text;
  v_approved_fields text[];

  v_full_name text;
  v_email text;
  v_phone text;
  v_is_lead boolean;
  v_contingent_code text;
  v_contingent_id uuid;
  v_participant_id uuid;

  v_entry_type text;
  v_entry_status text;
  v_entry_notes text;
  v_existing_entry_id uuid;

  v_created_contingents integer := 0;
  v_created_participants integer := 0;
  v_created_entries integer := 0;
  v_reused_records integer := 0;
  v_updated_records integer := 0;

  v_total_rows integer := 0;
  v_skipped_rows integer := 0;
  v_rejected_rows integer := 0;
  v_missing_from_file integer := 0;
  v_new_import_id uuid;
BEGIN
  -- 1. Authoritative organiser verification
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL OR NOT public.is_active_organiser() THEN
    RAISE EXCEPTION 'Active organiser privileges required';
  END IF;

  SELECT email
  INTO v_actor_email
  FROM public.profiles
  WHERE id = v_actor_id;

  -- 2. Validate header parameters
  v_clean_idempotency := trim(COALESCE(p_idempotency_key, ''));
  v_clean_hash := lower(trim(COALESCE(p_payload_hash, '')));
  v_clean_filename := left(trim(COALESCE(p_source_filename, '')), 255);
  v_clean_format := lower(trim(COALESCE(p_file_format, '')));

  IF char_length(v_clean_idempotency) < 8 OR char_length(v_clean_idempotency) > 128 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  IF v_clean_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid import payload digest';
  END IF;

  IF char_length(v_clean_filename) < 1 THEN
    RAISE EXCEPTION 'Source filename is required';
  END IF;

  IF v_clean_format NOT IN ('csv', 'xlsx') THEN
    RAISE EXCEPTION 'Unsupported file format';
  END IF;

  -- 3. Serialize concurrent imports for the same event cleanly
  PERFORM pg_advisory_xact_lock(hashtext('virtuoso_import:' || p_event_id::text));

  -- 4. Check idempotency after acquiring event lock
  SELECT *
  INTO v_existing_import
  FROM public.registration_imports
  WHERE event_id = p_event_id
    AND idempotency_key = v_clean_idempotency
    AND status = 'completed'
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_import.payload_hash <> v_clean_hash THEN
      RAISE EXCEPTION 'Conflict: idempotency key was already used for a different import payload';
    END IF;

    RETURN jsonb_build_object(
      'import_id', v_existing_import.id,
      'status', v_existing_import.status,
      'idempotent_replay', true,
      'total_rows', v_existing_import.total_rows,
      'created_contingents_count', v_existing_import.created_contingents_count,
      'created_participants_count', v_existing_import.created_participants_count,
      'created_entries_count', v_existing_import.created_entries_count,
      'reused_records_count', v_existing_import.reused_records_count,
      'updated_records_count', v_existing_import.updated_records_count,
      'skipped_rows_count', v_existing_import.skipped_rows_count,
      'rejected_rows_count', v_existing_import.rejected_rows_count,
      'missing_from_file_count', v_existing_import.missing_from_file_count,
      'created_at', v_existing_import.created_at
    );
  END IF;

  -- 5. Verify target event exists and is not archived
  SELECT id, code, entry_mode, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target event does not exist';
  END IF;

  IF v_event.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot import registrations into an archived event';
  END IF;

  -- 6. Process contingents atomically (create / reuse / allowlisted update)
  FOR v_op IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_contingent_ops, '[]'::jsonb))
  LOOP
    v_op_type := trim(COALESCE(v_op->>'op', ''));
    v_code := upper(trim(COALESCE(v_op->>'contingent_code', '')));
    v_code_key := upper(v_code);
    v_name := trim(regexp_replace(COALESCE(v_op->>'name', ''), '\s+', ' ', 'g'));
    v_institution := trim(regexp_replace(COALESCE(v_op->>'institution_name', ''), '\s+', ' ', 'g'));
    v_city := NULLIF(trim(COALESCE(v_op->>'institution_city', '')), '');
    v_ext_ref := NULLIF(trim(COALESCE(v_op->>'external_registration_ref', '')), '');
    v_contact_email := NULLIF(lower(trim(COALESCE(v_op->>'contact_email', ''))), '');
    v_contact_phone := NULLIF(trim(COALESCE(v_op->>'contact_phone', '')), '');
    v_notes := NULLIF(trim(COALESCE(v_op->>'notes', '')), '');
    v_existing_id := NULLIF(trim(COALESCE(v_op->>'existing_id', '')), '')::uuid;

    IF v_op_type = 'create' THEN
      IF EXISTS (
        SELECT 1 FROM public.contingents
        WHERE lower(trim(contingent_code)) = lower(v_code)
      ) THEN
        RAISE EXCEPTION 'Contingent "%" already exists in CMS (concurrent update or duplicate detected)', v_code;
      END IF;

      IF v_ext_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.contingents
        WHERE external_registration_ref = v_ext_ref
      ) THEN
        RAISE EXCEPTION 'Contingent external registration ref "%" already exists in CMS', v_ext_ref;
      END IF;

      INSERT INTO public.contingents (
        contingent_code,
        name,
        institution_name,
        institution_city,
        external_registration_ref,
        contact_email,
        contact_phone,
        is_active,
        notes
      )
      VALUES (
        v_code,
        v_name,
        v_institution,
        v_city,
        v_ext_ref,
        v_contact_email,
        v_contact_phone,
        true,
        v_notes
      )
      RETURNING id INTO v_contingent_id;

      v_created_contingents := v_created_contingents + 1;

    ELSIF v_op_type IN ('reuse', 'update') THEN
      IF v_existing_id IS NULL THEN
        RAISE EXCEPTION 'Existing contingent identifier is required for % operation', v_op_type;
      END IF;

      SELECT id
      INTO v_contingent_id
      FROM public.contingents
      WHERE id = v_existing_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced existing contingent was not found';
      END IF;

      IF v_op_type = 'reuse' THEN
        v_reused_records := v_reused_records + 1;
      ELSE
        SELECT COALESCE(array_agg(elem::text), ARRAY[]::text[])
        INTO v_approved_fields
        FROM jsonb_array_elements_text(COALESCE(v_op->'approved_fields', '[]'::jsonb)) AS elem;

        IF array_length(v_approved_fields, 1) IS NULL THEN
          RAISE EXCEPTION 'Approved field list is required for contingent update on "%"', v_code;
        END IF;

        -- Strict server-side allowlist: only approved registration metadata may be updated
        UPDATE public.contingents
        SET
          name = CASE WHEN 'name' = ANY(v_approved_fields) THEN v_name ELSE name END,
          institution_name = CASE WHEN 'institution_name' = ANY(v_approved_fields) THEN v_institution ELSE institution_name END,
          institution_city = CASE WHEN 'institution_city' = ANY(v_approved_fields) THEN v_city ELSE institution_city END,
          external_registration_ref = CASE WHEN 'external_registration_ref' = ANY(v_approved_fields) THEN v_ext_ref ELSE external_registration_ref END,
          contact_email = CASE WHEN 'contact_email' = ANY(v_approved_fields) THEN v_contact_email ELSE contact_email END,
          contact_phone = CASE WHEN 'contact_phone' = ANY(v_approved_fields) THEN v_contact_phone ELSE contact_phone END,
          notes = CASE WHEN 'notes' = ANY(v_approved_fields) THEN v_notes ELSE notes END
        WHERE id = v_existing_id;

        v_updated_records := v_updated_records + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported contingent operation "%"', v_op_type;
    END IF;

    IF v_code_key <> '' THEN
      v_contingent_ids := jsonb_set(v_contingent_ids, ARRAY[v_code_key], to_jsonb(v_contingent_id::text), true);
    END IF;
  END LOOP;

  -- 7. Process participants atomically (create / reuse / allowlisted update)
  FOR v_op IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_participant_ops, '[]'::jsonb))
  LOOP
    v_op_type := trim(COALESCE(v_op->>'op', ''));
    v_code := upper(trim(COALESCE(v_op->>'participant_code', '')));
    v_code_key := upper(v_code);
    v_full_name := trim(regexp_replace(COALESCE(v_op->>'full_name', ''), '\s+', ' ', 'g'));
    v_email := NULLIF(lower(trim(COALESCE(v_op->>'email', ''))), '');
    v_phone := NULLIF(trim(COALESCE(v_op->>'phone', '')), '');
    v_institution := trim(regexp_replace(COALESCE(v_op->>'institution_name', ''), '\s+', ' ', 'g'));
    v_ext_ref := NULLIF(trim(COALESCE(v_op->>'external_registration_ref', '')), '');
    v_is_lead := COALESCE((v_op->>'is_contingent_lead')::boolean, false);
    v_contingent_code := upper(trim(COALESCE(v_op->>'contingent_code', '')));
    v_existing_id := NULLIF(trim(COALESCE(v_op->>'existing_id', '')), '')::uuid;

    v_contingent_id := NULL;
    IF v_contingent_code <> '' THEN
      IF v_contingent_ids ? v_contingent_code THEN
        v_contingent_id := (v_contingent_ids->>v_contingent_code)::uuid;
      ELSE
        SELECT id INTO v_contingent_id
        FROM public.contingents
        WHERE lower(trim(contingent_code)) = lower(v_contingent_code);
      END IF;

      IF v_contingent_id IS NULL THEN
        RAISE EXCEPTION 'Contingent "%" for participant "%" could not be resolved', v_contingent_code, v_code;
      END IF;
    END IF;

    IF v_op_type = 'create' THEN
      IF v_is_lead AND v_contingent_id IS NULL THEN
        RAISE EXCEPTION 'Participant "%" cannot be contingent lead without a contingent', v_code;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.participants
        WHERE lower(trim(participant_code)) = lower(v_code)
      ) THEN
        RAISE EXCEPTION 'Participant "%" already exists in CMS (concurrent update or duplicate detected)', v_code;
      END IF;

      IF v_ext_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.participants
        WHERE external_registration_ref = v_ext_ref
      ) THEN
        RAISE EXCEPTION 'Participant external registration ref "%" already exists in CMS', v_ext_ref;
      END IF;

      INSERT INTO public.participants (
        contingent_id,
        participant_code,
        full_name,
        email,
        phone,
        institution_name,
        external_registration_ref,
        is_contingent_lead,
        is_active
      )
      VALUES (
        v_contingent_id,
        v_code,
        v_full_name,
        v_email,
        v_phone,
        v_institution,
        v_ext_ref,
        v_is_lead,
        true
      )
      RETURNING id INTO v_participant_id;

      v_created_participants := v_created_participants + 1;

    ELSIF v_op_type IN ('reuse', 'update') THEN
      IF v_existing_id IS NULL THEN
        RAISE EXCEPTION 'Existing participant identifier is required for % operation', v_op_type;
      END IF;

      SELECT id, contingent_id
      INTO v_participant_id, v_contingent_id
      FROM public.participants
      WHERE id = v_existing_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced existing participant was not found';
      END IF;

      IF v_op_type = 'reuse' THEN
        v_reused_records := v_reused_records + 1;
      ELSE
        SELECT COALESCE(array_agg(elem::text), ARRAY[]::text[])
        INTO v_approved_fields
        FROM jsonb_array_elements_text(COALESCE(v_op->'approved_fields', '[]'::jsonb)) AS elem;

        IF array_length(v_approved_fields, 1) IS NULL THEN
          RAISE EXCEPTION 'Approved field list is required for participant update on "%"', v_code;
        END IF;

        IF 'is_contingent_lead' = ANY(v_approved_fields) AND v_is_lead AND v_contingent_id IS NULL THEN
          RAISE EXCEPTION 'Cannot mark participant "%" as contingent lead without an assigned contingent', v_code;
        END IF;

        -- Strict server-side allowlist: operational / identity status columns are never overwritten
        UPDATE public.participants
        SET
          full_name = CASE WHEN 'full_name' = ANY(v_approved_fields) THEN v_full_name ELSE full_name END,
          email = CASE WHEN 'email' = ANY(v_approved_fields) THEN v_email ELSE email END,
          phone = CASE WHEN 'phone' = ANY(v_approved_fields) THEN v_phone ELSE phone END,
          institution_name = CASE WHEN 'institution_name' = ANY(v_approved_fields) THEN v_institution ELSE institution_name END,
          external_registration_ref = CASE WHEN 'external_registration_ref' = ANY(v_approved_fields) THEN v_ext_ref ELSE external_registration_ref END,
          is_contingent_lead = CASE WHEN 'is_contingent_lead' = ANY(v_approved_fields) THEN v_is_lead ELSE is_contingent_lead END
        WHERE id = v_existing_id;

        v_updated_records := v_updated_records + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported participant operation "%"', v_op_type;
    END IF;

    IF v_code_key <> '' THEN
      v_participant_ids := jsonb_set(v_participant_ids, ARRAY[v_code_key], to_jsonb(v_participant_id::text), true);
    END IF;
  END LOOP;

  -- 8. Create missing event entries cleanly without touching existing operational entry statuses
  FOR v_op IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_entry_ops, '[]'::jsonb))
  LOOP
    v_entry_type := lower(trim(COALESCE(v_op->>'entry_type', '')));
    v_entry_status := lower(trim(COALESCE(v_op->>'status', 'registered')));
    v_entry_notes := NULLIF(trim(COALESCE(v_op->>'notes', '')), '');
    v_contingent_code := upper(trim(COALESCE(v_op->>'contingent_code', '')));
    v_code := upper(trim(COALESCE(v_op->>'participant_code', '')));

    IF v_entry_type = 'contingent' THEN
      IF v_contingent_ids ? v_contingent_code THEN
        v_contingent_id := (v_contingent_ids->>v_contingent_code)::uuid;
      ELSE
        SELECT id INTO v_contingent_id
        FROM public.contingents
        WHERE lower(trim(contingent_code)) = lower(v_contingent_code);
      END IF;

      IF v_contingent_id IS NULL THEN
        RAISE EXCEPTION 'Contingent "%" could not be resolved for event entry', v_contingent_code;
      END IF;

      SELECT id INTO v_existing_entry_id
      FROM public.event_entries
      WHERE event_id = p_event_id
        AND contingent_id = v_contingent_id;

      IF v_existing_entry_id IS NOT NULL THEN
        -- Existing event entry is reused non-destructively (operational status untouched)
        v_reused_records := v_reused_records + 1;
      ELSE
        INSERT INTO public.event_entries (
          event_id,
          entry_type,
          contingent_id,
          participant_id,
          status,
          notes
        )
        VALUES (
          p_event_id,
          'contingent',
          v_contingent_id,
          NULL,
          v_entry_status,
          v_entry_notes
        );
        v_created_entries := v_created_entries + 1;
      END IF;

    ELSIF v_entry_type = 'individual' THEN
      IF v_participant_ids ? v_code THEN
        v_participant_id := (v_participant_ids->>v_code)::uuid;
      ELSE
        SELECT id INTO v_participant_id
        FROM public.participants
        WHERE lower(trim(participant_code)) = lower(v_code);
      END IF;

      IF v_participant_id IS NULL THEN
        RAISE EXCEPTION 'Participant "%" could not be resolved for event entry', v_code;
      END IF;

      SELECT id INTO v_existing_entry_id
      FROM public.event_entries
      WHERE event_id = p_event_id
        AND participant_id = v_participant_id;

      IF v_existing_entry_id IS NOT NULL THEN
        v_reused_records := v_reused_records + 1;
      ELSE
        INSERT INTO public.event_entries (
          event_id,
          entry_type,
          contingent_id,
          participant_id,
          status,
          notes
        )
        VALUES (
          p_event_id,
          'individual',
          NULL,
          v_participant_id,
          v_entry_status,
          v_entry_notes
        );
        v_created_entries := v_created_entries + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported event entry type "%"', v_entry_type;
    END IF;
  END LOOP;

  -- 9. Persist immutable completed import history summary
  v_total_rows := GREATEST(COALESCE((p_summary_meta->>'total_rows')::integer, 0), 0);
  v_skipped_rows := GREATEST(COALESCE((p_summary_meta->>'skipped_rows_count')::integer, 0), 0);
  v_rejected_rows := GREATEST(COALESCE((p_summary_meta->>'rejected_rows_count')::integer, 0), 0);
  v_missing_from_file := GREATEST(COALESCE((p_summary_meta->>'missing_from_file_count')::integer, 0), 0);

  INSERT INTO public.registration_imports (
    event_id,
    initiated_by,
    initiated_by_email,
    idempotency_key,
    payload_hash,
    source_filename,
    file_format,
    status,
    total_rows,
    created_contingents_count,
    created_participants_count,
    created_entries_count,
    reused_records_count,
    updated_records_count,
    skipped_rows_count,
    rejected_rows_count,
    missing_from_file_count,
    error_summary,
    summary_metadata
  )
  VALUES (
    p_event_id,
    v_actor_id,
    v_actor_email,
    v_clean_idempotency,
    v_clean_hash,
    v_clean_filename,
    v_clean_format,
    'completed',
    v_total_rows,
    v_created_contingents,
    v_created_participants,
    v_created_entries,
    v_reused_records,
    v_updated_records,
    v_skipped_rows,
    v_rejected_rows,
    v_missing_from_file,
    NULL,
    COALESCE(p_summary_meta, '{}'::jsonb)
  )
  RETURNING id INTO v_new_import_id;

  RETURN jsonb_build_object(
    'import_id', v_new_import_id,
    'status', 'completed',
    'idempotent_replay', false,
    'total_rows', v_total_rows,
    'created_contingents_count', v_created_contingents,
    'created_participants_count', v_created_participants,
    'created_entries_count', v_created_entries,
    'reused_records_count', v_reused_records,
    'updated_records_count', v_updated_records,
    'skipped_rows_count', v_skipped_rows,
    'rejected_rows_count', v_rejected_rows,
    'missing_from_file_count', v_missing_from_file,
    'created_at', timezone('utc', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_registration_import(uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_registration_import(uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) TO authenticated;
