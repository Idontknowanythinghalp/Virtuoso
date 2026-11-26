#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { requirePublicSupabaseConfig } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminSupabaseConfigured } from "@/lib/supabase/server-env";
import {
  authenticateSuperAdminOperatorWithDeps,
  commandRequiresServiceRole,
  createTeamAccountWithDeps,
  listTeamSessionsWithDeps,
  parseTeamAdminCliArgs,
  resetTeamPasswordWithDeps,
  revokeAllTeamSessionsWithDeps,
  revokeTeamSessionWithDeps,
  sanitizeSecretOutput,
  setTeamAccountActiveWithDeps,
} from "@/lib/auth/team-account-admin";

const ROOT_DIR = process.cwd();

function loadLocalEnvFile(filename) {
  const filePath = path.join(ROOT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    if (!/^[A-Z0-9_]+$/i.test(key)) {
      continue;
    }

    if (process.env[key] && process.env[key].trim() !== "") {
      continue;
    }

    let val = trimmed.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function promptLine(questionText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHiddenPassword(label) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      let buffer = "";
      const onData = (chunk) => {
        const text = chunk.toString("utf8");
        const newlineIndex = text.search(/[\r\n]/);
        if (newlineIndex !== -1) {
          buffer += text.slice(0, newlineIndex);
          cleanup();
          resolve(buffer);
          return;
        }
        buffer += text;
      };
      const onEnd = () => {
        cleanup();
        resolve(buffer);
      };
      const cleanup = () => {
        process.stdin.off("data", onData);
        process.stdin.off("end", onEnd);
        process.stdin.pause();
      };

      process.stdout.write(label);
      process.stdin.resume();
      process.stdin.on("data", onData);
      process.stdin.once("end", onEnd);
    });
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);
    let value = "";

    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
    };

    const onData = (buf) => {
      const str = buf.toString("utf8");
      for (const ch of str) {
        if (ch === "\r" || ch === "\n") {
          process.stdout.write("\n");
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          cleanup();
          reject(new Error("Operation cancelled by operator."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }
        value += ch;
      }
    };

    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function printUsage() {
  console.log(`Virtuoso CMS — Team Account Administration CLI (Super Admin Only)

Usage:
  npm run team:admin -- <command> [arguments] [--actor <super_admin_email>]

Commands:
  create <CONTINGENT_CODE>                   Provision a new team account (prompts hidden password)
  reset-password <CONTINGENT_CODE>           Reset password for an active team account (prompts hidden password)
  activate <CONTINGENT_CODE>                 Activate a team account (never restores old sessions)
  deactivate <CONTINGENT_CODE>               Deactivate a team account & revoke all active sessions
  sessions <CONTINGENT_CODE>                 List sessions for a contingent (timestamps & status only)
  revoke-session <CONTINGENT_CODE> [ID]      Revoke one active session (prompts selection if ID omitted)
  revoke-all-sessions <CONTINGENT_CODE>      Revoke all active sessions for a contingent (--yes skips prompt)
  help                                       Show this help text

Security rules:
  - Authenticates the human operator via their real organiser Supabase Auth email + password.
  - Database RPCs execute under the operator's verified Auth JWT (auth.uid()), never service_role.
  - SUPABASE_SERVICE_ROLE_KEY is used ONLY for Auth Admin user creation/password updates
    during "create" and "reset-password" commands.
  - Passwords are NEVER accepted as CLI flags; they are prompted interactively without echo.
  - Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (plus optional
    VIRTUOSO_ADMIN_EMAIL and SUPABASE_SERVICE_ROLE_KEY) from .env.local or process env.`);
}

function formatTimestamp(iso) {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString();
}

function createOperatorClient() {
  const { url, anonKey } = requirePublicSupabaseConfig();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createOperatorAuthDeps(operatorClient) {
  return {
    async signInWithPassword({ email, password }) {
      const { data, error } = await operatorClient.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user || !data.session) {
        return {
          userId: null,
          email: null,
          error: error?.message ?? "Invalid Super Admin credentials.",
        };
      }
      return {
        userId: data.user.id,
        email: data.user.email ?? email,
        error: null,
      };
    },

    async getOwnProfile(userId) {
      const { data, error } = await operatorClient
        .from("profiles")
        .select("id, email, role, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        return { profile: null, error: error.message };
      }
      return { profile: data ?? null, error: null };
    },

    async signOutLocal() {
      const { error } = await operatorClient.auth.signOut({ scope: "local" });
      return { error: error?.message ?? null };
    },
  };
}

function createTeamRpcDeps(operatorClient, adminClient) {
  return {
    generateUuid() {
      return crypto.randomUUID();
    },

    async preflightCreateTeamAccount({ contingentCode }) {
      const { data, error } = await operatorClient.rpc(
        "admin_preflight_team_account_creation",
        {
          p_contingent_code: contingentCode,
        },
      );
      if (error || !data) {
        return { contingent: null, error: error?.message ?? "Preflight failed" };
      }
      return { contingent: data, error: null };
    },

    async createAuthUser({ email, password }) {
      if (!adminClient) {
        return {
          authUserId: null,
          error: "Service role client is required to create Auth users.",
        };
      }
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          account_type: "team",
        },
      });
      if (error || !data.user) {
        return {
          authUserId: null,
          error: error?.message ?? "Auth user creation failed",
        };
      }
      return { authUserId: data.user.id, error: null };
    },

    async insertTeamAccountRecord({ teamAccountId, contingentId, authUserId }) {
      const { data, error } = await operatorClient.rpc(
        "admin_create_team_account",
        {
          p_team_account_id: teamAccountId,
          p_contingent_id: contingentId,
          p_auth_user_id: authUserId,
        },
      );
      if (error || !data) {
        return {
          created: null,
          error: error?.message ?? "Team account insert failed",
        };
      }
      return { created: data, error: null };
    },

    async resolveActiveTeamAccount({ contingentCode }) {
      const { data, error } = await operatorClient.rpc(
        "admin_resolve_active_team_account",
        {
          p_contingent_code: contingentCode,
        },
      );
      if (error || !data) {
        return {
          account: null,
          error: error?.message ?? "Unable to resolve active team account",
        };
      }
      return { account: data, error: null };
    },

    async updateAuthUserPassword({ authUserId, password }) {
      if (!adminClient) {
        return {
          error: "Service role client is required to update Auth passwords.",
        };
      }
      const { error } = await adminClient.auth.admin.updateUserById(
        authUserId,
        {
          password,
        },
      );
      return { error: error?.message ?? null };
    },

    async recordPasswordResetAudit({ contingentCode, teamAccountId }) {
      const { error } = await operatorClient.rpc(
        "admin_record_team_password_reset",
        {
          p_contingent_code: contingentCode,
          p_team_account_id: teamAccountId,
        },
      );
      return { error: error?.message ?? null };
    },

    async setTeamAccountActiveRpc({ contingentCode, nextIsActive }) {
      const { data, error } = await operatorClient.rpc(
        "admin_set_team_account_active",
        {
          p_contingent_code: contingentCode,
          p_is_active: nextIsActive,
        },
      );
      if (error || !data) {
        return {
          result: null,
          error: error?.message ?? "Status update failed",
        };
      }
      return { result: data, error: null };
    },

    async listTeamSessionsRpc({ contingentCode }) {
      const { data, error } = await operatorClient.rpc(
        "admin_list_team_sessions",
        {
          p_contingent_code: contingentCode,
        },
      );
      if (error || !data) {
        return {
          data: null,
          error: error?.message ?? "Unable to list sessions",
        };
      }
      return { data, error: null };
    },

    async revokeTeamSessionRpc({ contingentCode, teamSessionId }) {
      const { data, error } = await operatorClient.rpc(
        "admin_revoke_team_session",
        {
          p_contingent_code: contingentCode,
          p_team_session_id: teamSessionId,
        },
      );
      if (error || !data) {
        return {
          data: null,
          error: error?.message ?? "Unable to revoke session",
        };
      }
      return { data, error: null };
    },

    async revokeAllTeamSessionsRpc({ contingentCode }) {
      const { data, error } = await operatorClient.rpc(
        "admin_revoke_all_team_sessions",
        {
          p_contingent_code: contingentCode,
        },
      );
      if (error || !data) {
        return {
          data: null,
          error: error?.message ?? "Unable to revoke all sessions",
        };
      }
      return { data, error: null };
    },
  };
}

async function main() {
  loadLocalEnvFile(".env.local");
  loadLocalEnvFile(".env");

  const parsed = parseTeamAdminCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Error: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }

  const args = parsed.value;
  if (args.command === "help") {
    printUsage();
    return;
  }

  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!publicUrl || !publicAnonKey) {
    console.error(
      "Error: Missing Supabase public configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  const needsAdminAuthApi = commandRequiresServiceRole(args.command);
  if (needsAdminAuthApi && !isAdminSupabaseConfigured()) {
    console.error(
      `Error: Command "${args.command}" requires SUPABASE_SERVICE_ROLE_KEY in .env.local for Supabase Auth Admin API operations.`,
    );
    process.exitCode = 1;
    return;
  }

  let operatorEmail =
    args.actorEmail ?? (process.env.VIRTUOSO_ADMIN_EMAIL?.trim() || "");
  if (!operatorEmail) {
    operatorEmail = await promptLine("Enter Super Admin email: ");
  }

  const operatorPassword = await promptHiddenPassword(
    `Enter Super Admin password for ${operatorEmail || "operator"}: `,
  );

  const operatorClient = createOperatorClient();
  const authRes = await authenticateSuperAdminOperatorWithDeps({
    rawOperatorEmail: operatorEmail,
    rawOperatorPassword: operatorPassword,
    deps: createOperatorAuthDeps(operatorClient),
  });

  if (!authRes.ok) {
    console.error(`Error: ${sanitizeSecretOutput(authRes.error)}`);
    process.exitCode = 1;
    return;
  }

  const operator = authRes.operator;
  // Restrict service_role usage strictly to Auth Admin user provisioning/password updates
  const adminClient = needsAdminAuthApi ? createSupabaseAdminClient() : null;
  const deps = createTeamRpcDeps(operatorClient, adminClient);

  try {
    if (args.command === "create") {
      const password = await promptHiddenPassword(
        "Enter team password (min 10 chars): ",
      );
      const confirm = await promptHiddenPassword("Confirm team password: ");

      const res = await createTeamAccountWithDeps({
        operator,
        rawContingentCode: args.contingentCode ?? "",
        rawPassword: password,
        rawConfirmPassword: confirm,
        deps,
      });

      if (!res.ok) {
        console.error(`Error: ${sanitizeSecretOutput(res.error)}`);
        if (res.reconciliationRequired) {
          console.error(
            "Action required: Inspect the contingent's team account and Auth state before running create again.",
          );
        }
        process.exitCode = 1;
        return;
      }

      console.log(
        `Created active team account for ${res.contingentCode} (${res.contingentName} — ${res.institutionName}) [actor: ${res.actorEmail}].`,
      );
      return;
    }

    if (args.command === "reset-password") {
      const password = await promptHiddenPassword(
        "Enter new team password (min 10 chars): ",
      );
      const confirm = await promptHiddenPassword("Confirm new team password: ");

      const res = await resetTeamPasswordWithDeps({
        operator,
        rawContingentCode: args.contingentCode ?? "",
        rawNewPassword: password,
        rawConfirmPassword: confirm,
        deps,
      });

      if (!res.ok) {
        console.error(`Error: ${sanitizeSecretOutput(res.error)}`);
        process.exitCode = 1;
        return;
      }

      console.log(
        `Password reset completed and audited for ${res.contingentCode} (${res.contingentName}) [actor: ${res.actorEmail}].`,
      );
      return;
    }

    if (args.command === "activate" || args.command === "deactivate") {
      const nextIsActive = args.command === "activate";
      const res = await setTeamAccountActiveWithDeps({
        operator,
        rawContingentCode: args.contingentCode ?? "",
        nextIsActive,
        deps,
      });

      if (!res.ok) {
        console.error(`Error: ${sanitizeSecretOutput(res.error)}`);
        process.exitCode = 1;
        return;
      }

      if (res.operation === "deactivated") {
        console.log(
          `Deactivated team account for ${res.contingentCode}. Revoked ${res.revokedSessionCount} active session(s) with reason account_deactivated [actor: ${res.actorEmail}].`,
        );
      } else if (res.operation === "activated") {
        console.log(
          `Activated team account for ${res.contingentCode}. Prior revoked sessions remain revoked [actor: ${res.actorEmail}].${
            res.contingentIsActive
              ? ""
              : " Note: contingent is currently inactive, so login remains blocked until the contingent is activated."
          }`,
        );
      } else {
        console.log(
          `No change needed for ${res.contingentCode}: team account is already ${
            res.isActive ? "active" : "inactive"
          }.`,
        );
      }
      return;
    }

    if (args.command === "sessions") {
      const res = await listTeamSessionsWithDeps({
        operator,
        rawContingentCode: args.contingentCode ?? "",
        deps,
      });

      if (!res.ok) {
        console.error(`Error: ${sanitizeSecretOutput(res.error)}`);
        process.exitCode = 1;
        return;
      }

      console.log(
        `Contingent: ${res.contingentCode} (${res.contingentName}) | Contingent status: ${
          res.contingentIsActive ? "active" : "inactive"
        } | Team account: ${res.teamAccountIsActive ? "active" : "inactive"}`,
      );

      if (res.sessions.length === 0) {
        console.log("No device sessions recorded for this team account.");
        return;
      }

      res.sessions.forEach((session, idx) => {
        console.log(
          `[${idx + 1}] id=${session.sessionId} | status=${
            session.isActive ? "ACTIVE" : "REVOKED/INACTIVE"
          } | created=${formatTimestamp(session.createdAt)} | last_seen=${formatTimestamp(
            session.lastSeenAt,
          )} | revoked_at=${formatTimestamp(session.revokedAt)} | reason=${
            session.revokedReason ?? "—"
          }`,
        );
      });
      return;
    }

    if (args.command === "revoke-session") {
      let targetSessionId = args.sessionId;
      if (!targetSessionId) {
        const listRes = await listTeamSessionsWithDeps({
          operator,
          rawContingentCode: args.contingentCode ?? "",
          deps,
        });
        if (!listRes.ok) {
          console.error(`Error: ${sanitizeSecretOutput(listRes.error)}`);
          process.exitCode = 1;
          return;
        }

        const activeSessions = listRes.sessions.filter(
          (s) => s.revokedAt === null,
        );
        if (activeSessions.length === 0) {
          console.log(
            `No active device sessions to revoke for ${listRes.contingentCode}.`,
          );
          return;
        }

        console.log(`Active sessions for ${listRes.contingentCode}:`);
        activeSessions.forEach((s, idx) => {
          console.log(
            `[${idx + 1}] id=${s.sessionId} | created=${formatTimestamp(
              s.createdAt,
            )} | last_seen=${formatTimestamp(s.lastSeenAt)}`,
          );
        });

        const choice = await promptLine(
          "Enter session number or UUID to revoke: ",
        );
        const num = Number.parseInt(choice, 10);
        if (/^\d+$/.test(choice) && num >= 1 && num <= activeSessions.length) {
          targetSessionId = activeSessions[num - 1].sessionId;
        } else {
          targetSessionId = choice;
        }
      }

      const res = await revokeTeamSessionWithDeps({
        operator,
        rawContingentCode: args.contingentCode ?? "",
        rawSessionId: targetSessionId,
        deps,
      });

      if (!res.ok) {
        console.error(`Error: ${sanitizeSecretOutput(res.error)}`);
        process.exitCode = 1;
        return;
      }

      if (res.operation === "already_revoked") {
        console.log(
          `Session ${res.sessionId} for ${res.contingentCode} was already revoked (${res.revokedReason ?? "unknown"} at ${formatTimestamp(res.revokedAt)}).`,
        );
      } else {
        console.log(
          `Revoked session ${res.sessionId} for ${res.contingentCode} (reason=${res.revokedReason} at ${formatTimestamp(res.revokedAt)}) [actor: ${res.actorEmail}].`,
        );
      }
      return;
    }

    if (args.command === "revoke-all-sessions") {
      if (!args.assumeYes) {
        const answer = await promptLine(
          `Revoke ALL active device sessions for ${args.contingentCode}? Type "yes" to confirm: `,
        );
        if (answer.toLowerCase() !== "yes") {
          console.log("Cancelled. No sessions were revoked.");
          return;
        }
      }

      const res = await revokeAllTeamSessionsWithDeps({
        operator,
        rawContingentCode: args.contingentCode ?? "",
        deps,
      });

      if (!res.ok) {
        console.error(`Error: ${sanitizeSecretOutput(res.error)}`);
        process.exitCode = 1;
        return;
      }

      if (res.operation === "none_active") {
        console.log(`No active sessions found for ${res.contingentCode}.`);
      } else {
        console.log(
          `Revoked ${res.revokedCount} active session(s) for ${res.contingentCode} with reason organiser_revoked [actor: ${res.actorEmail}].`,
        );
      }
    }
  } finally {
    await operatorClient.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : "Unexpected CLI failure";
  console.error(`Error: ${sanitizeSecretOutput(msg)}`);
  process.exitCode = 1;
});
