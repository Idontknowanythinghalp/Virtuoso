# Virtuoso CMS — Database Migrations & Initial Super Admin Setup

## 1. Migration Application Order

Apply the SQL migrations to your existing `virtuoso` Supabase project in strict filename order:

1. `supabase/migrations/202611160001_stage1b_profiles.sql`
   - Creates `public.profiles`, constraints (`role`, `scope_mode`), indexes, `updated_at` trigger, last-active-Super-Admin protection trigger, helper functions (`is_active_organiser`, `is_active_super_admin`), and Row Level Security policies.
2. `supabase/migrations/202611160002_stage1b_audit_logs.sql`
   - Creates `public.audit_logs`, indexes, immutability trigger, and Super Admin-only `SELECT` Row Level Security policies.
3. `supabase/migrations/202611160003_stage2a_competition_structure.sql`
   - Creates `events`, `rounds`, `judging_criteria`, `contingents`, `participants`, and `event_entries`, transactional ordering RPCs (`reorder_event_rounds`, `reorder_round_criteria`), integrity/lock/XOR triggers, and active-organiser RLS policies.

Both migrations are non-destructive (`IF NOT EXISTS` and idempotent checks) and safe to run without resetting the database.

You can apply them either via the **Supabase Dashboard -> SQL Editor** (paste and run `0001` first, then `0002`) or via Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## 2. Supabase Auth Settings for Virtuoso CMS

In your Supabase Dashboard (`Authentication -> Providers -> Email`):

- Keep **Email** sign-in enabled.
- Disable **Allow new users to sign up** (or keep public organiser registration disabled) so random visitors cannot self-register organiser accounts.
- Confirm email verification behavior matches your provisioning workflow (`admin.createUser` in this CMS sets `email_confirm: true` for Super Admin-provisioned coordinators).

## 3. Initial Super Admin Provisioning (Safe Manual Procedure)

Never hardcode a default Super Admin password in code, migrations, or version control. Follow this procedure once after applying both migrations:

1. Open **Supabase Dashboard -> Authentication -> Users -> Add user -> Create new user**.
2. Enter the Super Admin's institutional email address and a strong unique password, check **Auto Confirm User**, and click **Create user**.
3. Copy the newly created user's **User UID** (UUID).
4. In **Supabase Dashboard -> SQL Editor**, run the following SQL (replacing the placeholders):

```sql
INSERT INTO public.profiles (id, full_name, email, role, scope_mode, is_active)
VALUES (
  '<PASTE-AUTH-USER-UUID>',
  '<Full Name>',
  '<super-admin-email@example.edu>',
  'super_admin',
  'all_events',
  true
);

INSERT INTO public.audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, after_data, metadata)
VALUES (
  '<PASTE-AUTH-USER-UUID>',
  '<super-admin-email@example.edu>',
  'account.initial_super_admin_provisioned',
  'profile',
  '<PASTE-AUTH-USER-UUID>',
  jsonb_build_object('role', 'super_admin', 'scope_mode', 'all_events', 'is_active', true),
  jsonb_build_object('source', 'manual_supabase_bootstrap')
);
```

5. Sign in at `/login` with that Super Admin account and verify access to `/`, `/admin/accounts`, and `/admin/audit-logs`.
