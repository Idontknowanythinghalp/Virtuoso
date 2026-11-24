import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  SUPER_ADMIN_ONLY,
  evaluateOrganiserAccess,
  sanitizeInternalRedirectPath,
} from "../src/lib/auth/policy.ts";
import {
  validateEmailInput,
  validateFullNameInput,
  validateOrganiserRoleInput,
  validatePasswordInput,
  validateProfileMutation,
} from "../src/lib/auth/account-rules.ts";
import { sanitizeAuditPayload } from "../src/lib/audit/sanitize.ts";

const ROOT_DIR = process.cwd();

const SUPER_ADMIN_PROFILE = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Asha Mathew",
  email: "asha.admin@sjcc.edu.in",
  role: "super_admin",
  scope_mode: "all_events",
  is_active: true,
  created_at: "2026-11-16T00:00:00Z",
  updated_at: "2026-11-16T00:00:00Z",
};

const COORDINATOR_PROFILE = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "Rohan Verma",
  email: "rohan.coord@sjcc.edu.in",
  role: "event_coordinator",
  scope_mode: "all_events",
  is_active: true,
  created_at: "2026-11-16T00:00:00Z",
  updated_at: "2026-11-16T00:00:00Z",
};

const INACTIVE_COORDINATOR_PROFILE = {
  ...COORDINATOR_PROFILE,
  id: "33333333-3333-4333-8333-333333333333",
  is_active: false,
};

test("1. Active Super Admin passes organiser and Super Admin guards", () => {
  const generalAccess = evaluateOrganiserAccess({
    authUserId: SUPER_ADMIN_PROFILE.id,
    profile: SUPER_ADMIN_PROFILE,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(generalAccess.ok, true);

  const adminAccess = evaluateOrganiserAccess({
    authUserId: SUPER_ADMIN_PROFILE.id,
    profile: SUPER_ADMIN_PROFILE,
    allowedRoles: SUPER_ADMIN_ONLY,
  });
  assert.equal(adminAccess.ok, true);
  if (adminAccess.ok) {
    assert.equal(adminAccess.sessionUser.role, "super_admin");
    assert.equal(adminAccess.sessionUser.scopeMode, "all_events");
  }
});

test("2. Active Event Coordinator passes general organiser guard with universal V1 scope", () => {
  const access = evaluateOrganiserAccess({
    authUserId: COORDINATOR_PROFILE.id,
    profile: COORDINATOR_PROFILE,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(access.ok, true);
  if (access.ok) {
    assert.equal(access.sessionUser.role, "event_coordinator");
    assert.equal(access.sessionUser.scopeMode, "all_events");
  }
});

test("3. Unauthenticated users are rejected and unsafe redirect targets are blocked", () => {
  const missingAuth = evaluateOrganiserAccess({
    authUserId: null,
    profile: SUPER_ADMIN_PROFILE,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.deepEqual(missingAuth, { ok: false, reason: "unauthenticated" });

  assert.equal(sanitizeInternalRedirectPath("/admin/accounts"), "/admin/accounts");
  assert.equal(sanitizeInternalRedirectPath("https://evil.example"), "/");
  assert.equal(sanitizeInternalRedirectPath("//evil.example"), "/");
  assert.equal(sanitizeInternalRedirectPath("/login?next=/"), "/");
});

test("4. Inactive accounts and missing profiles are denied access", () => {
  const inactive = evaluateOrganiserAccess({
    authUserId: INACTIVE_COORDINATOR_PROFILE.id,
    profile: INACTIVE_COORDINATOR_PROFILE,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.deepEqual(inactive, { ok: false, reason: "inactive" });

  const missingProfile = evaluateOrganiserAccess({
    authUserId: "44444444-4444-4444-8444-444444444444",
    profile: null,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.deepEqual(missingProfile, { ok: false, reason: "missing_profile" });
});

test("5. Event Coordinator is forbidden from Super Admin functionality", () => {
  const adminAttempt = evaluateOrganiserAccess({
    authUserId: COORDINATOR_PROFILE.id,
    profile: COORDINATOR_PROFILE,
    allowedRoles: SUPER_ADMIN_ONLY,
  });
  assert.deepEqual(adminAttempt, { ok: false, reason: "forbidden" });
});

test("6. Role & status mutation rules enforce Super Admin authority, no self-edits, and last-Super-Admin protection", () => {
  // Coordinator cannot modify anyone
  const coordAttempt = validateProfileMutation({
    actor: COORDINATOR_PROFILE,
    target: INACTIVE_COORDINATOR_PROFILE,
    nextRole: "super_admin",
    nextIsActive: true,
    activeSuperAdminCount: 1,
  });
  assert.equal(coordAttempt.ok, false);

  // Super Admin cannot modify own role or active status
  const selfEdit = validateProfileMutation({
    actor: SUPER_ADMIN_PROFILE,
    target: SUPER_ADMIN_PROFILE,
    nextRole: "event_coordinator",
    nextIsActive: true,
    activeSuperAdminCount: 2,
  });
  assert.equal(selfEdit.ok, false);

  // Cannot deactivate or demote last active Super Admin
  const secondSuperAdminActor = {
    ...SUPER_ADMIN_PROFILE,
    id: "55555555-5555-4555-8555-555555555555",
  };
  const demoteLast = validateProfileMutation({
    actor: secondSuperAdminActor,
    target: SUPER_ADMIN_PROFILE,
    nextRole: "event_coordinator",
    nextIsActive: true,
    activeSuperAdminCount: 1,
  });
  assert.equal(demoteLast.ok, false);

  const deactivateLast = validateProfileMutation({
    actor: secondSuperAdminActor,
    target: SUPER_ADMIN_PROFILE,
    nextRole: "super_admin",
    nextIsActive: false,
    activeSuperAdminCount: 1,
  });
  assert.equal(deactivateLast.ok, false);

  // Valid update when >= 2 active Super Admins exist
  const validDemotion = validateProfileMutation({
    actor: secondSuperAdminActor,
    target: SUPER_ADMIN_PROFILE,
    nextRole: "event_coordinator",
    nextIsActive: true,
    activeSuperAdminCount: 2,
  });
  assert.equal(validDemotion.ok, true);

  // Input validators
  assert.equal(validateEmailInput("Admin@SJCC.edu.in").ok, true);
  assert.equal(validateEmailInput("not-an-email").ok, false);
  assert.equal(validateFullNameInput("A").ok, false);
  assert.equal(validatePasswordInput("short").ok, false);
  assert.equal(validateOrganiserRoleInput("competitor").ok, false);
});

test("7. Audit payload sanitizer redacts sensitive credential fields", () => {
  const sanitized = sanitizeAuditPayload({
    email: "coord@sjcc.edu.in",
    password: "SuperSecretPassword123!",
    nested: {
      service_role_key: "eyJhbGci...",
      accessToken: "abc",
      role: "event_coordinator",
    },
  });

  assert.deepEqual(sanitized, {
    email: "coord@sjcc.edu.in",
    password: "[redacted]",
    nested: {
      service_role_key: "[redacted]",
      accessToken: "[redacted]",
      role: "event_coordinator",
    },
  });
});

test("8. SQL migrations enforce RLS, immutability, role constraints, and last-Super-Admin safeguard", () => {
  const profilesSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611160001_stage1b_profiles.sql",
    ),
    "utf8",
  );
  const auditSql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611160002_stage1b_audit_logs.sql",
    ),
    "utf8",
  );

  assert.match(profilesSql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(profilesSql, /CHECK \(role IN \('super_admin', 'event_coordinator'\)\)/i);
  assert.match(profilesSql, /CHECK \(scope_mode IN \('all_events'\)\)/i);
  assert.match(profilesSql, /CREATE POLICY profiles_select_own/i);
  assert.match(profilesSql, /CREATE POLICY profiles_select_super_admin/i);
  assert.match(
    profilesSql,
    /REVOKE INSERT, UPDATE, DELETE ON public\.profiles FROM anon, authenticated/i,
  );
  assert.match(profilesSql, /protect_last_super_admin/i);

  assert.match(auditSql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(auditSql, /CREATE POLICY audit_logs_select_super_admin/i);
  assert.match(
    auditSql,
    /REVOKE INSERT, UPDATE, DELETE ON public\.audit_logs FROM anon, authenticated/i,
  );
  assert.match(auditSql, /enforce_audit_logs_immutable/i);
});

test("9. Client components never import server-only secrets, and protected routes enforce requireActiveUser", () => {
  function walkTsFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(walkTsFiles(fullPath));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const srcFiles = walkTsFiles(path.join(ROOT_DIR, "src"));
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const isClientComponent =
      content.startsWith('"use client"') || content.startsWith("'use client'");
    if (isClientComponent) {
      assert.equal(
        content.includes("SUPABASE_SERVICE_ROLE_KEY"),
        false,
        `Client file ${filePath} must not reference SUPABASE_SERVICE_ROLE_KEY`,
      );
      assert.equal(
        content.includes("@/lib/supabase/admin"),
        false,
        `Client file ${filePath} must not import admin Supabase client`,
      );
      assert.equal(
        content.includes("@/lib/supabase/server"),
        false,
        `Client file ${filePath} must not import server Supabase client`,
      );
    }
  }

  const protectedPages = [
    "src/app/page.tsx",
    "src/app/modules/[slug]/page.tsx",
    "src/app/admin/accounts/page.tsx",
    "src/app/admin/audit-logs/page.tsx",
    "src/app/access-denied/page.tsx",
  ];

  for (const relPath of protectedPages) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    assert.match(
      content,
      /requireActiveUser\(/,
      `${relPath} must call requireActiveUser()`,
    );
  }

  const accountsActions = fs.readFileSync(
    path.join(ROOT_DIR, "src/app/actions/accounts.ts"),
    "utf8",
  );
  assert.match(
    accountsActions,
    /requireActiveUserForAction\(SUPER_ADMIN_ONLY/,
    "Admin account actions must enforce SUPER_ADMIN_ONLY",
  );
});
