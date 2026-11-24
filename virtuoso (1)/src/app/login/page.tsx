import React from "react";
import { redirect } from "next/navigation";
import { isPublicSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateOrganiserAccess, sanitizeInternalRedirectPath } from "@/lib/auth/policy";
import { siteConfig } from "@/lib/site-config";
import { BrandMark } from "@/components/cms/BrandMark";
import { LoginForm } from "@/components/auth/LoginForm";
import type { OrganiserProfile } from "@/types/auth";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  inactive:
    "Your organiser account is currently deactivated. Contact a Super Admin to restore access.",
  no_profile:
    "Your login was authenticated, but no organiser CMS profile exists for this account. Contact a Super Admin.",
  unauthorized: "Please sign in with an authorized organiser account.",
  config:
    "Supabase environment variables are not configured yet. Add them to .env.local before signing in.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const supabaseConfigured = isPublicSupabaseConfigured();
  const nextPath = sanitizeInternalRedirectPath(params.next, "/");

  if (supabaseConfigured && !params.error) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, role, scope_mode, is_active, created_at, updated_at",
        )
        .eq("id", user.id)
        .maybeSingle<OrganiserProfile>();

      const decision = evaluateOrganiserAccess({
        authUserId: user.id,
        profile,
      });

      if (decision.ok) {
        redirect(nextPath);
      }
    }
  }

  const errorBanner =
    params.error && ERROR_MESSAGES[params.error]
      ? ERROR_MESSAGES[params.error]
      : !supabaseConfigured
        ? ERROR_MESSAGES.config
        : null;

  const statusMessage =
    params.message === "logged_out"
      ? "You have been signed out of the Virtuoso Organiser CMS."
      : null;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F8FAFC] px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6">
        <div className="flex items-center gap-3">
          <BrandMark
            src="/brand/virtuoso-emblem.png"
            alt="Virtuoso Emblem"
            className="h-11 w-11 shrink-0 rounded-md border border-slate-200 bg-[#200000] object-contain p-1.5"
            fallbackLabel="V"
          />
          <div>
            <p className="text-xs font-medium text-[#4B0507]">
              {siteConfig.institution}
            </p>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900">
              {siteConfig.appName}
            </h1>
          </div>
        </div>

        <section
          aria-labelledby="login-heading"
          className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8"
        >
          <div className="space-y-1.5 border-b border-slate-100 pb-5">
            <h2
              id="login-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Organiser Sign In
            </h2>
            <p className="text-sm text-slate-600">
              Restricted to authorised Virtuoso Super Admins and Event
              Coordinators.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {statusMessage ? (
              <div
                role="status"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                {statusMessage}
              </div>
            ) : null}

            {errorBanner ? (
              <div
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {errorBanner}
              </div>
            ) : null}

            {!supabaseConfigured ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
                <p className="font-medium text-slate-900">
                  Required environment variables:
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-mono">
                  <li>NEXT_PUBLIC_SUPABASE_URL</li>
                  <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
                  <li>SUPABASE_SERVICE_ROLE_KEY</li>
                </ul>
              </div>
            ) : null}

            <LoginForm nextPath={nextPath} disabled={!supabaseConfigured} />
          </div>

          <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Public registration is disabled. Organiser accounts are provisioned
            exclusively by a Virtuoso Super Admin.
          </p>
        </section>
      </div>

      <footer className="mx-auto mt-8 flex w-full max-w-md items-center justify-between text-xs text-slate-500">
        <span>{siteConfig.department}</span>
        <span>4–5 December 2026</span>
      </footer>
    </div>
  );
}
