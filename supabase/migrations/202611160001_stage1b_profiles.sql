-- Stage 1B Migration 0001: Organiser profiles, constraints, safety triggers, and RLS policies
-- Safe to apply incrementally to the existing Virtuoso Supabase project.
-- Do NOT drop tables or reset existing data.

-- 1. Ensure helper function for updated_at timestamps exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- 2. Create profiles table if it does not already exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  scope_mode text NOT NULL DEFAULT 'all_events',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Reconcile columns safely in case an earlier partial table exists
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all_events',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

-- 4. Add explicit check & unique constraints idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_full_name_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_full_name_length_check
      CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_email_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_email_length_check
      CHECK (char_length(trim(email)) >= 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('super_admin', 'event_coordinator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_scope_mode_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_scope_mode_check
      CHECK (scope_mode IN ('all_events'));
  END IF;
END
$$;

-- 5. Indexes for lookups and role queries
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_uidx
  ON public.profiles (lower(email));

CREATE INDEX IF NOT EXISTS profiles_role_active_idx
  ON public.profiles (role, is_active);

-- 6. Automatic updated_at maintenance
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 7. Database-level safeguard against removing/demoting/deactivating the last active Super Admin
CREATE OR REPLACE FUNCTION public.prevent_last_super_admin_loss()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_active_super_admins integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'super_admin' AND OLD.is_active = true THEN
      SELECT count(*)
      INTO remaining_active_super_admins
      FROM public.profiles
      WHERE role = 'super_admin'
        AND is_active = true
        AND id <> OLD.id;

      IF remaining_active_super_admins = 0 THEN
        RAISE EXCEPTION 'Cannot delete the last active super_admin profile';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'super_admin'
       AND OLD.is_active = true
       AND (NEW.role <> 'super_admin' OR NEW.is_active = false) THEN
      SELECT count(*)
      INTO remaining_active_super_admins
      FROM public.profiles
      WHERE role = 'super_admin'
        AND is_active = true
        AND id <> OLD.id;

      IF remaining_active_super_admins = 0 THEN
        RAISE EXCEPTION 'Cannot deactivate or demote the last active super_admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_last_super_admin ON public.profiles;
CREATE TRIGGER protect_last_super_admin
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_super_admin_loss();

-- 8. SECURITY DEFINER role helper functions (avoid recursive RLS evaluation)
CREATE OR REPLACE FUNCTION public.is_active_organiser()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('super_admin', 'event_coordinator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role = 'super_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_organiser() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_organiser() TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_super_admin() TO authenticated;

-- 9. Enable Row Level Security and define explicit policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_select_super_admin ON public.profiles;
CREATE POLICY profiles_select_super_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_active_super_admin());

-- Deliberately grant no INSERT / UPDATE / DELETE policies to anon or authenticated.
-- All organiser account provisioning, role assignments, and activation toggles
-- are executed server-side via the service-role client after requireActiveUser(['super_admin']).
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
