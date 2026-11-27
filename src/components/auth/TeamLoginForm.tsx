"use client";

import React, { useActionState, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { signInTeamAction } from "@/app/actions/team-auth";
import { normalizeTeamCodeInput } from "@/lib/auth/team-account-rules";
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
  const [teamCode, setTeamCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    const teamCodeInput = event.currentTarget.elements.namedItem(
      "teamCode",
    ) as HTMLInputElement | null;
    if (teamCodeInput) {
      const normalized = normalizeTeamCodeInput(teamCodeInput.value);
      teamCodeInput.value = normalized;
      setTeamCode(normalized);
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={handleFormSubmit}
      className="space-y-5"
      noValidate
    >
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
          value={teamCode}
          onChange={(event) =>
            setTeamCode(event.target.value.toUpperCase())
          }
          onBlur={() =>
            setTeamCode((current) => normalizeTeamCodeInput(current))
          }
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
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={disabled || isPending}
            placeholder="Enter your team password"
            className="block min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
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
