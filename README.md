# Virtuoso CMS

Competition Management System (CMS) for **Virtuoso**, presented by the Department of Business Administration, St. Joseph's College of Commerce (Autonomous), Bengaluru (4–5 December 2026).

## Current Stage: Stage 1B — Secure Organiser Foundation

Stage 1B adds Supabase Auth + SSR session handling, `profiles` with `super_admin` and `event_coordinator` roles, authoritative server-side guards (`requireActiveUser`), Super Admin account management, immutable audit logging, and Row Level Security (RLS) migrations.

Competition modules (events, rounds, contingents, judging, results) and the separate competitor portal remain deferred to subsequent stages.

## Tech Stack

- **Framework:** Next.js App Router (Next.js 16 `proxy.ts` + Server Components & Actions)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Auth & Database:** Supabase Auth + PostgreSQL (`@supabase/ssr`, `@supabase/supabase-js`)
- **Linting:** ESLint (`eslint-config-next`)
- **Icons:** Lucide React

## Project Structure

```text
src/
  app/
    actions/      Server Actions for organiser auth and Super Admin account management
    admin/        Super Admin pages (/admin/accounts, /admin/audit-logs)
    login/        Organiser sign-in page (public registration disabled)
    modules/      Protected placeholder routes for future CMS modules
    access-denied/
  components/     Layout shell, auth forms, and Super Admin UI components
  features/       Reserved for upcoming domain modules
  lib/
    audit/        Server-only audit logger and payload sanitizer
    auth/         Authoritative guards, access evaluation policy, and account rules
    supabase/     Browser, server SSR, and server-only Admin clients
  types/          Shared TypeScript types
  proxy.ts        Next.js 16 session refresh proxy
supabase/
  migrations/     Version-controlled incremental SQL migrations
  README.md       Migration order and initial Super Admin bootstrap instructions
tests/
  stage1b-auth.test.mjs
```

## Local Setup & Verification

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your `virtuoso` Supabase project values:
   ```bash
   cp .env.example .env.local
   ```
3. Apply the SQL migrations in order (`supabase/README.md`) and bootstrap your first Super Admin.
4. Start the development server (port `3000`):
   ```bash
   npm run dev
   ```
5. Run all verification checks:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
