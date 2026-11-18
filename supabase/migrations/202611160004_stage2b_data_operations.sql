-- Stage 2B Migration 0004: Data Operations (Imports, Codenames, Documents)
-- Tables: registration_imports, codenames, competition_documents
-- Depends on: 202611160001_stage1b_profiles.sql, 202611160003_stage2a_competition_structure.sql
-- Do NOT modify Stage 1B or Stage 2A migrations. Additive and non-destructive only.

-- ============================================================================
-- 1. REGISTRATION IMPORTS (Audit history for CSV / Excel imports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.registration_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  imported_by_email text NULL,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  total_rows integer NOT NULL DEFAULT 0,
  created_contingents_count integer NOT NULL DEFAULT 0,
  updated_contingents_count integer NOT NULL DEFAULT 0,
  created_participants_count integer NOT NULL DEFAULT 0,
  updated_participants_count integer NOT NULL DEFAULT 0,
  created_entries_count integer NOT NULL DEFAULT 0,
  skipped_records_count integer NOT NULL DEFAULT 0,
  rejected_records_count integer NOT NULL DEFAULT 0,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_filename_length_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_filename_length_check
      CHECK (char_length(trim(file_name)) BETWEEN 1 AND 255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_imports_counts_positive_check'
      AND conrelid = 'public.registration_imports'::regclass
  ) THEN
    ALTER TABLE public.registration_imports
      ADD CONSTRAINT registration_imports_counts_positive_check
      CHECK (
        total_rows >= 0
        AND created_contingents_count >= 0
        AND updated_contingents_count >= 0
        AND created_participants_count >= 0
        AND updated_participants_count >= 0
        AND created_entries_count >= 0
        AND skipped_records_count >= 0
        AND rejected_records_count >= 0
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS registration_imports_created_idx
  ON public.registration_imports (created_at DESC);

-- ============================================================================
-- 2. ANONYMOUS CODENAMES (Event-Wide or Per-Round scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.codenames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  round_id uuid NULL REFERENCES public.rounds (id) ON DELETE RESTRICT,
  event_entry_id uuid NOT NULL REFERENCES public.event_entries (id) ON DELETE RESTRICT,
  codename text NOT NULL,
  assigned_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'codenames_length_check'
      AND conrelid = 'public.codenames'::regclass
  ) THEN
    ALTER TABLE public.codenames
      ADD CONSTRAINT codenames_length_check
      CHECK (char_length(trim(codename)) BETWEEN 2 AND 60);
  END IF;
END
$$;

-- Uniqueness: Event-Wide scope (round_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS codenames_event_entry_event_wide_uidx
  ON public.codenames (event_id, event_entry_id)
  WHERE round_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS codenames_event_codename_uidx
  ON public.codenames (event_id, lower(trim(codename)))
  WHERE round_id IS NULL;

-- Uniqueness: Per-Round scope (round_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS codenames_round_entry_uidx
  ON public.codenames (round_id, event_entry_id)
  WHERE round_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS codenames_round_codename_uidx
  ON public.codenames (round_id, lower(trim(codename)))
  WHERE round_id IS NOT NULL;

-- General query indexes
CREATE INDEX IF NOT EXISTS codenames_event_idx
  ON public.codenames (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS codenames_entry_idx
  ON public.codenames (event_entry_id);

DROP TRIGGER IF EXISTS set_codenames_updated_at ON public.codenames;
CREATE TRIGGER set_codenames_updated_at
  BEFORE UPDATE ON public.codenames
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. COMPETITION DOCUMENTS (Private storage metadata)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.competition_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  round_id uuid NULL REFERENCES public.rounds (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'competition-documents',
  uploaded_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_title_length_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_title_length_check
      CHECK (char_length(trim(title)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_filename_length_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_filename_length_check
      CHECK (char_length(trim(file_name)) BETWEEN 1 AND 255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_filesize_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_filesize_check
      CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400); -- 25 MB max
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS competition_documents_event_idx
  ON public.competition_documents (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS competition_documents_round_idx
  ON public.competition_documents (round_id, created_at DESC)
  WHERE round_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_competition_documents_updated_at ON public.competition_documents;
CREATE TRIGGER set_competition_documents_updated_at
  BEFORE UPDATE ON public.competition_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY POLICIES (active organisers only; zero anon access)
-- ============================================================================
REVOKE ALL ON public.registration_imports FROM anon;
REVOKE ALL ON public.codenames FROM anon;
REVOKE ALL ON public.competition_documents FROM anon;

-- Prevent accidental deletion of codenames by authenticated organisers
REVOKE DELETE ON public.codenames FROM authenticated;
REVOKE DELETE ON public.registration_imports FROM authenticated;

ALTER TABLE public.registration_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codenames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_documents ENABLE ROW LEVEL SECURITY;

-- registration_imports policies
DROP POLICY IF EXISTS registration_imports_select_active_organiser ON public.registration_imports;
CREATE POLICY registration_imports_select_active_organiser
  ON public.registration_imports FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS registration_imports_insert_active_organiser ON public.registration_imports;
CREATE POLICY registration_imports_insert_active_organiser
  ON public.registration_imports FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

-- codenames policies
DROP POLICY IF EXISTS codenames_select_active_organiser ON public.codenames;
CREATE POLICY codenames_select_active_organiser
  ON public.codenames FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS codenames_insert_active_organiser ON public.codenames;
CREATE POLICY codenames_insert_active_organiser
  ON public.codenames FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS codenames_update_active_organiser ON public.codenames;
CREATE POLICY codenames_update_active_organiser
  ON public.codenames FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

-- competition_documents policies
DROP POLICY IF EXISTS competition_documents_select_active_organiser ON public.competition_documents;
CREATE POLICY competition_documents_select_active_organiser
  ON public.competition_documents FOR SELECT TO authenticated
  USING (public.is_active_organiser());

DROP POLICY IF EXISTS competition_documents_insert_active_organiser ON public.competition_documents;
CREATE POLICY competition_documents_insert_active_organiser
  ON public.competition_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS competition_documents_update_active_organiser ON public.competition_documents;
CREATE POLICY competition_documents_update_active_organiser
  ON public.competition_documents FOR UPDATE TO authenticated
  USING (public.is_active_organiser())
  WITH CHECK (public.is_active_organiser());

DROP POLICY IF EXISTS competition_documents_delete_active_organiser ON public.competition_documents;
CREATE POLICY competition_documents_delete_active_organiser
  ON public.competition_documents FOR DELETE TO authenticated
  USING (public.is_active_organiser());
