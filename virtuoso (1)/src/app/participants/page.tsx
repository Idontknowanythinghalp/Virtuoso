import React from "react";
import { CmsShell } from "@/components/layout/CmsShell";
import {
  ParticipantsManager,
  type ParticipantListItem,
} from "@/components/competition/ParticipantsManager";
import { requireActiveUser } from "@/lib/auth/guards";
import { ALL_ORGANISER_ROLES } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContingentRecord, ParticipantRecord } from "@/types/competition";

export const dynamic = "force-dynamic";

async function loadParticipantsData(): Promise<{
  participants: ParticipantListItem[];
  contingents: Pick<
    ContingentRecord,
    "id" | "contingent_code" | "name" | "institution_name" | "is_active"
  >[];
  migrationMissing: boolean;
}> {
  const supabase = await createSupabaseServerClient();

  const [participantsRes, contingentsRes] = await Promise.all([
    supabase
      .from("participants")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<ParticipantRecord[]>(),
    supabase
      .from("contingents")
      .select("id, contingent_code, name, institution_name, is_active")
      .order("contingent_code", { ascending: true })
      .returns<
        Pick<
          ContingentRecord,
          "id" | "contingent_code" | "name" | "institution_name" | "is_active"
        >[]
      >(),
  ]);

  if (participantsRes.error || contingentsRes.error) {
    return { participants: [], contingents: [], migrationMissing: true };
  }

  const contingents = contingentsRes.data ?? [];
  const contingentById = new Map(contingents.map((c) => [c.id, c]));

  const participants: ParticipantListItem[] = (participantsRes.data ?? []).map(
    (p) => ({
      ...p,
      contingent: p.contingent_id
        ? contingentById.get(p.contingent_id) ?? null
        : null,
    }),
  );

  return { participants, contingents, migrationMissing: false };
}

export default async function ParticipantsPage() {
  const { sessionUser } = await requireActiveUser(ALL_ORGANISER_ROLES, {
    routeLabel: "/participants",
  });

  const { participants, contingents, migrationMissing } =
    await loadParticipantsData();

  return (
    <CmsShell
      user={sessionUser}
      breadcrumbs={[
        { label: siteConfig.appName, href: "/" },
        { label: "Participants" },
      ]}
    >
      <section className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-[#4B0507]">
          Stage 2A · Participant Registry
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Participants Registry
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Register and manage participants. Participants can be linked to an
          institutional contingent or registered independently without a
          contingent.
        </p>
      </section>

      <ParticipantsManager
        participants={participants}
        contingents={contingents}
        migrationMissing={migrationMissing}
      />
    </CmsShell>
  );
}
