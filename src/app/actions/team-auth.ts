"use server";

import { redirect } from "next/navigation";
import { resolveTeamLogoutRedirect } from "@/lib/auth/team-account-rules";
import {
  logoutCurrentTeamSession,
  signInTeamWithPassword,
} from "@/lib/auth/team-guards";
import type { TeamLoginActionState } from "@/types/team-auth";

export async function signInTeamAction(
  _prevState: TeamLoginActionState,
  formData: FormData,
): Promise<TeamLoginActionState> {
  const rawTeamCode = String(formData.get("teamCode") ?? "");
  const rawPassword = String(formData.get("password") ?? "");
  const rawNext = formData.get("next");

  const result = await signInTeamWithPassword(
    rawTeamCode,
    rawPassword,
    typeof rawNext === "string" ? rawNext : null,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  redirect(result.redirectTo);
}

export async function logoutTeamAction(): Promise<void> {
  const result = await logoutCurrentTeamSession();
  redirect(resolveTeamLogoutRedirect(result));
}


