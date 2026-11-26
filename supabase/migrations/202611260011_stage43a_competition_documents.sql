-- Stage 4.3A Migration 0011: Competition Round PDF Metadata & Private Storage Bucket
-- Depends on:
--   202611160001_stage1b_profiles.sql (profiles, set_updated_at, is_active_super_admin)
--   202611160002_stage1b_audit_logs.sql (audit_logs)
--   202611160003_stage2a_competition_structure.sql (events, rounds, rounds_id_event_unique)
-- Additive only. Does NOT modify migrations 0001–0010.

-- ============================================================================
-- 1. COMPETITION DOCUMENTS TABLE (supports 0..N PDFs per round)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.competition_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE RESTRICT,
  round_id uuid NOT NULL,
  title text NOT NULL,
  original_filename text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'competition-documents',
  storage_object_path text NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size_bytes bigint NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  updated_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  archived_by uuid NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT competition_documents_round_event_fkey
    FOREIGN KEY (round_id, event_id)
    REFERENCES public.rounds (id, event_id)
    ON DELETE RESTRICT
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
      CHECK (pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_filename_length_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_filename_length_check
      CHECK (
        pg_catalog.char_length(pg_catalog.btrim(original_filename)) BETWEEN 5 AND 255
        AND original_filename NOT LIKE '%/%'
        AND pg_catalog.strpos(original_filename, pg_catalog.chr(92)) = 0
        AND original_filename NOT LIKE '%..%'
        AND pg_catalog.right(pg_catalog.lower(pg_catalog.btrim(original_filename)), 4) = '.pdf'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_bucket_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_bucket_check
      CHECK (storage_bucket = 'competition-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_mime_type_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_mime_type_check
      CHECK (mime_type = 'application/pdf');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_file_size_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_file_size_check
      CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_status_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_status_check
      CHECK (status IN ('active', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_storage_path_safety_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_storage_path_safety_check
      CHECK (
        storage_object_path IS NULL
        OR (
          pg_catalog.char_length(pg_catalog.btrim(storage_object_path)) BETWEEN 10 AND 500
          AND storage_object_path NOT LIKE '/%'
          AND storage_object_path NOT LIKE '%..%'
          AND pg_catalog.strpos(storage_object_path, pg_catalog.chr(92)) = 0
          AND storage_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
          AND pg_catalog.split_part(storage_object_path, '/', 1) = event_id::text
          AND pg_catalog.split_part(storage_object_path, '/', 2) = round_id::text
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_documents_lifecycle_consistency_check'
      AND conrelid = 'public.competition_documents'::regclass
  ) THEN
    ALTER TABLE public.competition_documents
      ADD CONSTRAINT competition_documents_lifecycle_consistency_check
      CHECK (
        (
          status = 'active'
          AND storage_object_path IS NOT NULL
          AND archived_at IS NULL
          AND archived_by IS NULL
        )
        OR
        (
          status = 'archived'
          AND storage_object_path IS NULL
          AND archived_at IS NOT NULL
          AND archived_by IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS competition_documents_storage_path_uidx
  ON public.competition_documents (storage_object_path)
  WHERE storage_object_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS competition_documents_round_status_idx
  ON public.competition_documents (event_id, round_id, status, created_at ASC);

DROP TRIGGER IF EXISTS set_competition_documents_updated_at ON public.competition_documents;
CREATE TRIGGER set_competition_documents_updated_at
  BEFORE UPDATE ON public.competition_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Prevent cross-round/event reassignment after creation
CREATE OR REPLACE FUNCTION public.protect_competition_document_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id <> OLD.event_id OR NEW.round_id <> OLD.round_id THEN
      RAISE EXCEPTION 'Competition document cannot be reassigned to a different event or round';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_competition_document_integrity ON public.competition_documents;
CREATE TRIGGER enforce_competition_document_integrity
  BEFORE UPDATE ON public.competition_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_competition_document_integrity();

-- ============================================================================
-- 2. ROW LEVEL SECURITY (Super Admin only; zero anon/coordinator/team access)
-- ============================================================================
REVOKE ALL ON public.competition_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.competition_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.competition_documents TO service_role;

ALTER TABLE public.competition_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS competition_documents_select_super_admin ON public.competition_documents;
CREATE POLICY competition_documents_select_super_admin
  ON public.competition_documents
  FOR SELECT
  TO authenticated
  USING (public.is_active_super_admin());

DROP POLICY IF EXISTS competition_documents_insert_super_admin ON public.competition_documents;
CREATE POLICY competition_documents_insert_super_admin
  ON public.competition_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_super_admin());

DROP POLICY IF EXISTS competition_documents_update_super_admin ON public.competition_documents;
CREATE POLICY competition_documents_update_super_admin
  ON public.competition_documents
  FOR UPDATE
  TO authenticated
  USING (public.is_active_super_admin())
  WITH CHECK (public.is_active_super_admin());

-- ============================================================================
-- 3. PRIVATE SUPABASE STORAGE BUCKET & OBJECT ACCESS LOCKDOWN
-- ============================================================================
-- Creates a private bucket (public = false) capped at 25 MiB (26,214,400 bytes)
-- and restricted to application/pdf MIME type.
-- Note: All reads, uploads, replacements, and deletions are executed strictly
-- on the server via service_role after Super Admin / Stage 4.3 authorization.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'competition-documents',
  'competition-documents',
  false,
  26214400,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Defense-in-depth: explicitly block anon and authenticated roles from direct
-- browser/client access to objects in the competition-documents bucket.
-- In Supabase, storage.objects may be owned by supabase_storage_admin; if the
-- SQL Editor caller lacks ownership privileges on storage.objects, a clear
-- NOTICE is emitted so the operator can verify no permissive policies exist
-- on bucket_id = 'competition-documents' in Supabase Dashboard -> Storage -> Policies.
DO $$
BEGIN
  DROP POLICY IF EXISTS competition_documents_deny_anon_storage ON storage.objects;
  CREATE POLICY competition_documents_deny_anon_storage
    ON storage.objects
    AS RESTRICTIVE
    FOR ALL
    TO anon
    USING (bucket_id <> 'competition-documents')
    WITH CHECK (bucket_id <> 'competition-documents');

  DROP POLICY IF EXISTS competition_documents_deny_authenticated_storage ON storage.objects;
  CREATE POLICY competition_documents_deny_authenticated_storage
    ON storage.objects
    AS RESTRICTIVE
    FOR ALL
    TO authenticated
    USING (bucket_id <> 'competition-documents')
    WITH CHECK (bucket_id <> 'competition-documents');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privilege to create restrictive policy on storage.objects directly; confirm in Supabase Dashboard -> Storage -> Policies that bucket "competition-documents" has zero permissive policies for anon or authenticated.';
END
$$;
