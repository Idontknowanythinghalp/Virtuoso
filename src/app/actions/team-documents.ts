"use server";

import { TeamAuthError, requireActiveTeamForAction } from "@/lib/auth/team-guards";
import { issueParticipantDocumentViewUrl } from "@/lib/team-portal/documents-read";
import type { ParticipantDocumentViewResult } from "@/types/competition";

export async function viewParticipantRoundDocumentAction(
  documentId: string,
): Promise<ParticipantDocumentViewResult> {
  try {
    const team = await requireActiveTeamForAction();
    return await issueParticipantDocumentViewUrl(team, documentId);
  } catch (err) {
    if (err instanceof TeamAuthError) {
      if (err.code === "unauthenticated") {
        return {
          ok: false,
          reason: "unauthenticated",
          message: "Please sign in as a team to view competition documents.",
        };
      }
      if (err.code === "organiser_forbidden") {
        return {
          ok: false,
          reason: "organiser_forbidden",
          message: "Organiser accounts cannot access participant documents.",
        };
      }
      if (err.code === "invalid_team_session") {
        return {
          ok: false,
          reason: "invalid_team_session",
          message: "Your team session is no longer active. Please sign in again.",
        };
      }
      return {
        ok: false,
        reason: "error",
        message:
          "Team document viewing is temporarily unavailable. Please contact a Virtuoso organiser.",
      };
    }

    console.error(
      "[team-documents-action] unexpected error opening participant document:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return {
      ok: false,
      reason: "error",
      message: "Unable to open this document right now. Please try again.",
    };
  }
}
