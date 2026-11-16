-- Stage 1B Migration 0002: Immutable audit_logs table and RLS policies
-- Depends on: 202611160001_stage1b_profiles.sql (public.profiles and public.is_active_super_admin())

-- 1. Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_email text NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NULL,
  before_data jsonb NULL,
  after_data jsonb NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Reconcile columns safely if table already exists
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_email text NULL,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text NULL,
  ADD COLUMN IF NOT EXISTS before_data jsonb NULL,
  ADD COLUMN IF NOT EXISTS after_data jsonb NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now());

-- 4. Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_action_check'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_action_check
      CHECK (char_length(trim(action)) BETWEEN 2 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_entity_type_check'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_entity_type_check
      CHECK (char_length(trim(entity_type)) BETWEEN 2 AND 80);
  END IF;
END
$$;

-- 5. Indexes for Super Admin audit log filtering and pagination
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON public.audit_logs (action);

CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx
  ON public.audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id);

-- 6. Immutability trigger: audit records must never be modified or deleted
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs entries are immutable and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS enforce_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER enforce_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- 7. Enable Row Level Security and restrict access strictly to active Super Admins
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_super_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_super_admin
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_active_super_admin());

-- No INSERT, UPDATE, or DELETE policies for anon/authenticated.
-- Audit entries are written exclusively by server-only code using the service-role client.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
