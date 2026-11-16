"use client";

import React, { useActionState } from "react";
import { LockKeyhole } from "lucide-react";
import {
  signInOrganiserAction,
  type LoginActionState,
} from "@/app/actions/auth";

interface LoginFormProps {
  nextPath: string;
  disabled?: boolean;
}

const INITIAL_STATE: LoginActionState = { error: null };

export function LoginForm({ nextPath, disabled = false }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    signInOrganiserAction,
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
          htmlFor="email"
          className="block text-sm font-medium text-slate-800"
        >
          Organiser Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={disabled || isPending}
          placeholder="name@sjcc.edu.in"
          className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
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
          placeholder="Enter your password"
          className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4B0507] focus:outline-none focus:ring-2 focus:ring-[#4B0507]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <button
        type="submit"
        disabled={disabled || isPending}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#4B0507] px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#380305] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B0507] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{isPending ? "Signing in..." : "Sign In to Organiser CMS"}</span>
      </button>
    </form>
  );
}
