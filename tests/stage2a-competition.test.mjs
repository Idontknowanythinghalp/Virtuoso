import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ALL_ORGANISER_ROLES,
  evaluateOrganiserAccess,
} from "../src/lib/auth/policy.ts";
import {
  validateContingentInput,
  validateEventEntryInput,
  validateEventEntryStatus,
  validateEventInput,
  validateJudgingCriterionInput,
  validateParticipantInput,
  validateRoundAllowsCriteriaMutation,
  validateRoundInput,
  validateUuid,
} from "../src/lib/competition/validation.ts";

const ROOT_DIR = process.cwd();

const SAMPLE_EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_CONTINGENT_ID = "22222222-2222-4222-8222-222222222222";
const SAMPLE_PARTICIPANT_ID = "33333333-3333-4333-8333-333333333333";

test("1. Both active Super Admin and Event Coordinator pass Stage 2A organiser checks while unauthenticated/inactive are rejected", () => {
  const coordinator = evaluateOrganiserAccess({
    authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    profile: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      full_name: "Meera Nair",
      email: "meera@sjcc.edu.in",
      role: "event_coordinator",
      scope_mode: "all_events",
      is_active: true,
      created_at: "2026-11-16T00:00:00Z",
      updated_at: "2026-11-16T00:00:00Z",
    },
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.equal(coordinator.ok, true);

  const inactive = evaluateOrganiserAccess({
    authUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    profile: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      full_name: "Inactive Coord",
      email: "inactive@sjcc.edu.in",
      role: "event_coordinator",
      scope_mode: "all_events",
      is_active: false,
      created_at: "2026-11-16T00:00:00Z",
      updated_at: "2026-11-16T00:00:00Z",
    },
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.deepEqual(inactive, { ok: false, reason: "inactive" });

  const unauthenticated = evaluateOrganiserAccess({
    authUserId: null,
    profile: null,
    allowedRoles: ALL_ORGANISER_ROLES,
  });
  assert.deepEqual(unauthenticated, { ok: false, reason: "unauthenticated" });
});

test("2. Event validation enforces canonical entry_mode, codename_mode, status, and rejects incompatible legacy values", () => {
  for (const codenameMode of ["event_wide", "per_round"]) {
    const valid = validateEventInput({
      code: "evt-01",
      name: "Configured Track",
      description: "Organiser configured event",
      entryMode: "contingent",
      codenameMode,
      status: "draft",
      minTeamSize: "",
      maxTeamSize: "",
    });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.value.code, "EVT-01");
      assert.equal(valid.value.min_team_size, null);
      assert.equal(valid.value.max_team_size, null);
    }
  }

  for (const badCodenameMode of ["none", "per_event", "global_contingent"]) {
    const rejected = validateEventInput({
      code: "EVT-01",
      name: "Bad Codename",
      entryMode: "contingent",
      codenameMode: badCodenameMode,
      status: "draft",
    });
    assert.equal(
      rejected.ok,
      false,
      `Legacy codename_mode "${badCodenameMode}" must be rejected`,
    );
  }

  // Variable non-4 team sizes must be supported without hardcoding 4
  const validVariableTeamSize = validateEventInput({
    code: "EVT-02",
    name: "Variable Team Track",
    entryMode: "hybrid",
    codenameMode: "per_round",
    status: "active",
    minTeamSize: "2",
    maxTeamSize: "6",
  });
  assert.equal(validVariableTeamSize.ok, true);
  if (validVariableTeamSize.ok) {
    assert.equal(validVariableTeamSize.value.min_team_size, 2);
    assert.equal(validVariableTeamSize.value.max_team_size, 6);
  }

  const invalidReversedBounds = validateEventInput({
    code: "EVT-03",
    name: "Invalid Bounds",
    entryMode: "contingent",
    codenameMode: "event_wide",
    status: "draft",
    minTeamSize: "5",
    maxTeamSize: "3",
  });
  assert.equal(invalidReversedBounds.ok, false);

  const invalidMode = validateEventInput({
    code: "EVT-04",
    name: "Bad Mode",
    entryMode: "solo_only",
    codenameMode: "event_wide",
    status: "draft",
  });
  assert.equal(invalidMode.ok, false);
});

test("3. Round and judging criteria validators enforce canonical scoring_method & attribution_mode, numeric rules, and lock protection", () => {
  for (const scoringMethod of [
    "criteria_sum",
    "criteria_weighted",
    "direct_points",
  ]) {
    for (const attributionMode of [
      "individual_judge",
      "panel_consolidated",
      "round_direct",
    ]) {
      const validRound = validateRoundInput({
        roundNumber: "1",
        name: "Preliminary Round",
        scoringMethod,
        attributionMode,
        status: "ready",
        isLocked: false,
      });
      assert.equal(
        validRound.ok,
        true,
        `${scoringMethod} + ${attributionMode} must be accepted`,
      );
    }
  }

  for (const badScoring of [
    "weighted_rubric",
    "points_sum",
    "average_score",
    "pass_fail",
  ]) {
    const rejected = validateRoundInput({
      roundNumber: "1",
      name: "Bad Scoring",
      scoringMethod: badScoring,
      attributionMode: "individual_judge",
      status: "draft",
      isLocked: false,
    });
    assert.equal(
      rejected.ok,
      false,
      `Incompatible scoring_method "${badScoring}" must be rejected`,
    );
  }

  for (const badAttr of ["per_entry", "per_judge", "paper_offline"]) {
    const rejected = validateRoundInput({
      roundNumber: "1",
      name: "Bad Attribution",
      scoringMethod: "criteria_sum",
      attributionMode: badAttr,
      status: "draft",
      isLocked: false,
    });
    assert.equal(
      rejected.ok,
      false,
      `Incompatible attribution_mode "${badAttr}" must be rejected`,
    );
  }

  const badRoundNum = validateRoundInput({
    roundNumber: "0",
    name: "Zero Round",
    scoringMethod: "criteria_sum",
    attributionMode: "individual_judge",
    status: "draft",
    isLocked: false,
  });
  assert.equal(badRoundNum.ok, false);

  const validCriterion = validateJudgingCriterionInput({
    displayOrder: "1",
    name: "Analytical Clarity",
    maxPoints: "25",
    weight: "1.5",
    rubricGuidance: "Assess structure and evidence.",
  });
  assert.equal(validCriterion.ok, true);

  const zeroPoints = validateJudgingCriterionInput({
    displayOrder: "1",
    name: "Zero Points",
    maxPoints: "0",
    weight: "1",
  });
  assert.equal(zeroPoints.ok, false);

  const negativeWeight = validateJudgingCriterionInput({
    displayOrder: "1",
    name: "Negative Weight",
    maxPoints: "20",
    weight: "-2",
  });
  assert.equal(negativeWeight.ok, false);

  assert.equal(
    validateRoundAllowsCriteriaMutation({ is_locked: false }).ok,
    true,
  );
  assert.equal(
    validateRoundAllowsCriteriaMutation({ is_locked: true }).ok,
    false,
  );
});

test("4. Contingents and participants support variable team sizes and independent individuals without a contingent", () => {
  const validContingent = validateContingentInput({
    contingentCode: "con-101",
    name: "Contingent Alpha",
    institutionName: "Sample College",
    institutionCity: "Bengaluru",
    externalRegistrationRef: "REG-2026-01",
    contactEmail: "team@college.edu",
    isActive: true,
  });
  assert.equal(validContingent.ok, true);

  // Individual participant with NO contingent
  const validIndividual = validateParticipantInput({
    contingentId: "",
    participantCode: "par-101",
    fullName: "Ananya Rao",
    email: "ananya@college.edu",
    institutionName: "Sample College",
    isContingentLead: false,
    isActive: true,
  });
  assert.equal(validIndividual.ok, true);
  if (validIndividual.ok) {
    assert.equal(validIndividual.value.contingent_id, null);
    assert.equal(validIndividual.value.is_contingent_lead, false);
  }

  // Individual without a contingent cannot be marked contingent lead
  const invalidLeadWithoutContingent = validateParticipantInput({
    contingentId: "",
    participantCode: "par-102",
    fullName: "Invalid Lead",
    institutionName: "Sample College",
    isContingentLead: true,
    isActive: true,
  });
  assert.equal(invalidLeadWithoutContingent.ok, false);

  // Participant belonging to a contingent
  const validMember = validateParticipantInput({
    contingentId: SAMPLE_CONTINGENT_ID,
    participantCode: "par-103",
    fullName: "Karthik Menon",
    institutionName: "Sample College",
    isContingentLead: true,
    isActive: true,
  });
  assert.equal(validMember.ok, true);
  if (validMember.ok) {
    assert.equal(validMember.value.contingent_id, SAMPLE_CONTINGENT_ID);
    assert.equal(validMember.value.is_contingent_lead, true);
  }
});

test("5. Event entries enforce strict contingent XOR participant, event entry_mode compatibility, and non-archived status", () => {
  // Valid contingent entry
  const contingentEntry = validateEventEntryInput({
    eventId: SAMPLE_EVENT_ID,
    eventEntryMode: "contingent",
    eventStatus: "active",
    entryType: "contingent",
    contingentId: SAMPLE_CONTINGENT_ID,
    participantId: "",
  });
  assert.equal(contingentEntry.ok, true);
  if (contingentEntry.ok) {
    assert.equal(contingentEntry.value.contingent_id, SAMPLE_CONTINGENT_ID);
    assert.equal(contingentEntry.value.participant_id, null);
  }

  // Valid individual entry
  const individualEntry = validateEventEntryInput({
    eventId: SAMPLE_EVENT_ID,
    eventEntryMode: "individual",
    eventStatus: "draft",
    entryType: "individual",
    contingentId: "",
    participantId: SAMPLE_PARTICIPANT_ID,
  });
  assert.equal(individualEntry.ok, true);
  if (individualEntry.ok) {
    assert.equal(individualEntry.value.contingent_id, null);
    assert.equal(individualEntry.value.participant_id, SAMPLE_PARTICIPANT_ID);
  }

  // Reject both contingent AND participant supplied
  const bothSupplied = validateEventEntryInput({
    eventId: SAMPLE_EVENT_ID,
    eventEntryMode: "hybrid",
    eventStatus: "active",
    entryType: "contingent",
    contingentId: SAMPLE_CONTINGENT_ID,
    participantId: SAMPLE_PARTICIPANT_ID,
  });
  assert.equal(bothSupplied.ok, false);

  // Reject neither supplied
  const neitherSupplied = validateEventEntryInput({
    eventId: SAMPLE_EVENT_ID,
    eventEntryMode: "hybrid",
    eventStatus: "active",
    entryType: "individual",
    contingentId: "",
    participantId: "",
  });
  assert.equal(neitherSupplied.ok, false);

  // Reject mismatched entry_mode
  const modeMismatch = validateEventEntryInput({
    eventId: SAMPLE_EVENT_ID,
    eventEntryMode: "contingent",
    eventStatus: "active",
    entryType: "individual",
    participantId: SAMPLE_PARTICIPANT_ID,
  });
  assert.equal(modeMismatch.ok, false);

  // Reject archived event
  const archivedEvent = validateEventEntryInput({
    eventId: SAMPLE_EVENT_ID,
    eventEntryMode: "hybrid",
    eventStatus: "archived",
    entryType: "contingent",
    contingentId: SAMPLE_CONTINGENT_ID,
  });
  assert.equal(archivedEvent.ok, false);

  assert.equal(validateEventEntryStatus("checked_in").ok, true);
  assert.equal(validateEventEntryStatus("invalid_status").ok, false);
  assert.equal(validateUuid("not-a-uuid", "Event").ok, false);
});

test("6. Stage 2A SQL migration enforces schema constraints, XOR, RLS, ON DELETE RESTRICT, and score-lock trigger", () => {
  const sql = fs.readFileSync(
    path.join(
      ROOT_DIR,
      "supabase/migrations/202611160003_stage2a_competition_structure.sql",
    ),
    "utf8",
  );

  for (const table of [
    "public.events",
    "public.rounds",
    "public.judging_criteria",
    "public.contingents",
    "public.participants",
    "public.event_entries",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
    assert.match(
      sql,
      new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON ${table} FROM anon`, "i"),
    );
  }

  assert.match(sql, /CHECK \(entry_mode IN \('contingent', 'individual', 'hybrid'\)\)/i);
  assert.match(sql, /CHECK \(codename_mode IN \('event_wide', 'per_round'\)\)/i);
  assert.match(
    sql,
    /CHECK \(scoring_method IN \('criteria_sum', 'criteria_weighted', 'direct_points'\)\)/i,
  );
  assert.match(
    sql,
    /CHECK \(attribution_mode IN \('individual_judge', 'panel_consolidated', 'round_direct'\)\)/i,
  );
  for (const stale of [
    "per_event",
    "global_contingent",
    "weighted_rubric",
    "points_sum",
    "average_score",
    "pass_fail",
    "per_entry",
    "per_judge",
    "paper_offline",
  ]) {
    assert.equal(
      sql.includes(`'${stale}'`),
      false,
      `SQL migration must not contain stale enum literal '${stale}'`,
    );
  }
  assert.match(sql, /ON DELETE RESTRICT/i);
  assert.match(sql, /event_entries_xor_subject_check/i);
  assert.match(sql, /event_entries_unique_contingent_uidx/i);
  assert.match(sql, /event_entries_unique_participant_uidx/i);
  assert.match(sql, /prevent_criteria_mutation_when_locked_or_scored/i);
  assert.match(sql, /to_regclass\('public\.scores'\)/i);
  assert.match(sql, /reorder_event_rounds/i);
  assert.match(sql, /reorder_round_criteria/i);
  assert.match(sql, /is_active_organiser\(\)/i);
});

test("7. Stage 2A routes enforce requireActiveUser, audit logging is non-silent, and client components stay isolated", () => {
  const stage2aPages = [
    "src/app/events/page.tsx",
    "src/app/events/[eventId]/page.tsx",
    "src/app/events/[eventId]/rounds/[roundId]/page.tsx",
    "src/app/contingents/page.tsx",
    "src/app/contingents/[contingentId]/page.tsx",
    "src/app/participants/page.tsx",
    "src/app/participants/[participantId]/page.tsx",
  ];

  for (const relPath of stage2aPages) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    assert.match(
      content,
      /requireActiveUser\(ALL_ORGANISER_ROLES/,
      `${relPath} must call requireActiveUser(ALL_ORGANISER_ROLES, ...)`,
    );
  }

  const auditLogger = fs.readFileSync(
    path.join(ROOT_DIR, "src/lib/audit/logger.ts"),
    "utf8",
  );
  assert.match(auditLogger, /console\.error\(/);
  assert.match(auditLogger, /normalizeUuidOrNull/);
  assert.match(auditLogger, /return \{ ok: false/);

  const stage2aActions = [
    "src/app/actions/competition.ts",
    "src/app/actions/registry.ts",
  ];
  for (const relPath of stage2aActions) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    assert.match(
      content,
      /requireActiveUserForAction\(ALL_ORGANISER_ROLES/,
      `${relPath} must enforce requireActiveUserForAction`,
    );
    assert.match(
      content,
      /isAdminSupabaseConfigured\(\)/,
      `${relPath} must verify audit logging configuration`,
    );
  }

  const clientFiles = [
    "src/components/competition/EventsManager.tsx",
    "src/components/competition/EventDetailManager.tsx",
    "src/components/competition/RoundDetailManager.tsx",
    "src/components/competition/ContingentsManager.tsx",
    "src/components/competition/ContingentDetailManager.tsx",
    "src/components/competition/ParticipantsManager.tsx",
    "src/components/competition/ParticipantDetailManager.tsx",
  ];

  for (const relPath of clientFiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    assert.equal(
      content.includes("window.confirm") ||
        content.includes("window.alert") ||
        content.includes("window.open"),
      false,
      `${relPath} must not use browser alert/confirm/open dialogs`,
    );
  }
});
