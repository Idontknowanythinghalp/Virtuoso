import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import { RoundDetailManager } from "@/components/competition/RoundDetailManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyRoundReleaseLoadError } from "@/lib/competition/round-release";
import type {
  EventRecord,
  JudgingCriterionRecord,
  RoundRecord,
  RoundReleaseSessionRecord,
} from "@/types/competition";

export const dynamic = "force-dynamic";

interface RoundDetailPageProps {
  params: Promise<{ eventId: string; roundId: string }>;
}

export default async function RoundDetailPage({ params }: RoundDetailPageProps) {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events/[eventId]/rounds/[roundId]",
  });

  const { eventId, roundId } = await params;
  const eventCheck = validateUuid(eventId, "Event");
  const roundCheck = validateUuid(roundId, "Round");
  if (!eventCheck.ok || !roundCheck.ok) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const [eventRes, roundRes, criteriaRes, sessionsRes, serverNowRes] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, code, name, status")
        .eq("id", eventCheck.value)
        .maybeSingle<Pick<EventRecord, "id" | "code" | "name" | "status">>(),
      supabase
        .from("rounds")
        .select("*")
        .eq("id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .maybeSingle<RoundRecord>(),
      supabase
        .from("judging_criteria")
        .select("*")
        .eq("round_id", roundCheck.value)
        .order("display_order", { ascending: true })
        .returns<JudgingCriterionRecord[]>(),
      supabase
        .from("round_release_sessions")
        .select("*")
        .eq("round_id", roundCheck.value)
        .eq("event_id", eventCheck.value)
        .order("session_number", { ascending: false })
        .returns<RoundReleaseSessionRecord[]>(),
      supabase.rpc("get_db_server_timestamp"),
    ]);

  if (eventRes.error || !eventRes.data || roundRes.error || !roundRes.data) {
    notFound();
  }

  const event = eventRes.data;
  const round = roundRes.data;
  const criteria = criteriaRes.data ?? [];
  const sessionsErrorKind = classifyRoundReleaseLoadError(sessionsRes.error);
  const releaseMigrationMissing = sessionsErrorKind === "migration_missing";
  const dbServerNowIso =
    !serverNowRes.error &&
    typeof serverNowRes.data === "string" &&
    Number.isFinite(Date.parse(serverNowRes.data))
      ? serverNowRes.data
      : null;

  let releaseLoadError: string | null = null;
  if (!releaseMigrationMissing) {
    if (sessionsErrorKind === "load_error") {
      releaseLoadError =
        "Unable to load round release sessions from the database.";
    } else if (!dbServerNowIso) {
      releaseLoadError =
        "Unable to read authoritative database clock timestamp.";
    }
  }

  const releaseSessions =
    releaseMigrationMissing || sessionsErrorKind === "load_error"
      ? []
      : (sessionsRes.data ?? []);

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Events & Rounds", href: "/events" },
        { label: event.code, href: `/events/${event.id}` },
        { label: `Round ${round.round_number}: ${round.name}` },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="font-mono text-xs font-medium text-[#4B0507]">
          {event.code} · Round {round.round_number}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {round.name}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {round.description ||
            "Configure round release settings, evaluation rules, and ordered judging criteria."}
        </p>
      </section>

      <RoundDetailManager
        event={event}
        round={round}
        criteria={criteria}
        releaseSessions={releaseSessions}
        dbServerNowIso={dbServerNowIso}
        releaseMigrationMissing={releaseMigrationMissing}
        releaseLoadError={releaseLoadError}
      />
    </CmsShell>
  );
}
