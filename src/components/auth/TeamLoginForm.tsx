"use client";

import React, { useActionState } from "react";
import { LockKeyhole } from "lucide-react";
import { signInTeamAction } from "@/app/actions/team-auth";
import type { TeamLoginActionState } from "@/types/team-auth";

interface TeamLoginFormProps {
  nextPath: string;
  disabled?: boolean;
}

const INITIAL_STATE: TeamLoginActionState = { error: null };

export function TeamLoginForm({
  nextPath,
  disabled = false,
}: TeamLoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    signInTeamAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      {state.error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="teamCode"
          className="block text-sm font-medium text-slate-800"
        >
          Team Code
        </label>
        <input
          id="teamCode"
          name="teamCode"
          type="text"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          required
          disabled={disabled || isPending}
          placeholder="e.g. SJCC-01"
          className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-800"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={disabled || isPending}
          placeholder="Enter your team password"
          className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <button
        type="submit"
        disabled={disabled || isPending}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{isPending ? "Signing in..." : "Sign In to Team Portal"}</span>
      </button>
    </form>
  );
}
