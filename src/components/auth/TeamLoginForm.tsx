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
          className="rounded-md border border-red-400/45 bg-[#350A0A] px-4 py-3 text-sm text-red-200"
        >
          {state.error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="teamCode"
          className="block text-sm font-medium text-[#F5F0EC]"
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
          className="block min-h-11 w-full rounded-md border border-[#542525] bg-[#200000] px-3.5 py-2 font-mono text-sm uppercase text-[#F5F0EC] placeholder:normal-case placeholder:font-sans placeholder:text-[#B9AAA5]/60 focus:border-[#D9AD61] focus:outline-none focus:ring-2 focus:ring-[#D9AD61]/25 disabled:cursor-not-allowed disabled:bg-[#350A0A]/60"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[#F5F0EC]"
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
            className="block min-h-11 w-full rounded-md border border-[#542525] bg-[#200000] py-2 pl-3.5 pr-11 text-sm text-[#F5F0EC] placeholder:text-[#B9AAA5]/60 focus:border-[#D9AD61] focus:outline-none focus:ring-2 focus:ring-[#D9AD61]/25 disabled:cursor-not-allowed disabled:bg-[#350A0A]/60"
          />
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-[#B9AAA5] transition-colors hover:text-[#D9AD61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] disabled:cursor-not-allowed disabled:opacity-50"
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
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#D9AD61] px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-[#200000] transition-colors hover:bg-[#E4BC77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9AD61] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B0808] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{isPending ? "Signing in..." : "Sign In to Team Portal"}</span>
      </button>
    </form>
  );
}
