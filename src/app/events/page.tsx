import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  EventsManager,
  type EventSummaryItem,
} from "@/components/competition/EventsManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventRecord } from "@/types/competition";

export const dynamic = "force-dynamic";

async function loadEventsSummary(): Promise<{
  events: EventSummaryItem[];
  migrationMissing: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: eventsData, error: eventsErr } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<EventRecord[]>();

  if (eventsErr || !eventsData) {
    return { events: [], migrationMissing: Boolean(eventsErr) };
  }

  const [{ data: roundRows }, { data: entryRows }] = await Promise.all([
    supabase.from("rounds").select("event_id"),
    supabase.from("event_entries").select("event_id"),
  ]);

  const roundCounts = new Map<string, number>();
  for (const row of roundRows ?? []) {
    const eid = (row as { event_id: string }).event_id;
    roundCounts.set(eid, (roundCounts.get(eid) ?? 0) + 1);
  }

  const entryCounts = new Map<string, number>();
  for (const row of entryRows ?? []) {
    const eid = (row as { event_id: string }).event_id;
    entryCounts.set(eid, (entryCounts.get(eid) ?? 0) + 1);
  }

  const events: EventSummaryItem[] = eventsData.map((evt) => ({
    ...evt,
    roundsCount: roundCounts.get(evt.id) ?? 0,
    entriesCount: entryCounts.get(evt.id) ?? 0,
  }));

  return { events, migrationMissing: false };
}

export default async function EventsPage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/events",
  });

  const { events, migrationMissing } = await loadEventsSummary();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Events & Rounds" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Competition Management
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Competition Events
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Configure competition events, entry modes, codename policies, round
          structures, and participating entries.
        </p>
      </section>

      <EventsManager events={events} migrationMissing={migrationMissing} />
    </CmsShell>
  );
}
