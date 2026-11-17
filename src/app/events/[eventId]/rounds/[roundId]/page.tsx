import React from "react";
import { notFound } from "next/navigation";
import { CmsShell } from "@/components/layout/CmsShell";
import { RoundDetailManager } from "@/components/competition/RoundDetailManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { validateUuid } from "@/lib/competition/validation";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EventRecord,
  JudgingCriterionRecord,
  RoundRecord,
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

  const [eventRes, roundRes, criteriaRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, code, name")
      .eq("id", eventCheck.value)
      .maybeSingle<Pick<EventRecord, "id" | "code" | "name">>(),
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
  ]);

  if (eventRes.error || !eventRes.data || roundRes.error || !roundRes.data) {
    notFound();
  }

  const event = eventRes.data;
  const round = roundRes.data;
  const criteria = criteriaRes.data ?? [];

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
            "Configure round evaluation settings and ordered judging criteria."}
        </p>
      </section>

      <RoundDetailManager event={event} round={round} criteria={criteria} />
    </CmsShell>
  );
}
