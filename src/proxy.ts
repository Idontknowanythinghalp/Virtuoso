import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeTeamRedirectPath } from "@/lib/auth/team-account-rules";
import { getPublicSupabaseConfig } from "@/lib/env";

const PUBLIC_PATHS = new Set(["/login", "/team/login"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

function isTeamRoute(pathname: string): boolean {
  return pathname === "/team" || pathname.startsWith("/team/");
}

function redirectWithCookies(
  targetUrl: URL,
  sourceResponse: NextResponse,
): NextResponse {
  const redirectResponse = NextResponse.redirect(targetUrl);
  for (const cookie of sourceResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const supabaseConfig = getPublicSupabaseConfig();

  // If Supabase environment variables are not configured yet, route protected pages
  // to their corresponding login route with ?error=config.
  if (!supabaseConfig) {
    if (!isPublicPath(pathname)) {
      const configUrl = request.nextUrl.clone();
      configUrl.pathname = isTeamRoute(pathname) ? "/team/login" : "/login";
      configUrl.search = "";
      configUrl.searchParams.set("error", "config");
      return NextResponse.redirect(configUrl);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refresh the auth token and validate the user with Supabase Auth.
  // Authoritative role/session checks also execute in server guards.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/imports")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Authentication is required. Please sign in again.",
        },
        { status: 401 },
      );
    }

    if (isTeamRoute(pathname)) {
      const teamLoginUrl = request.nextUrl.clone();
      teamLoginUrl.pathname = "/team/login";
      teamLoginUrl.search = "";
      if (pathname !== "/team") {
        teamLoginUrl.searchParams.set("next", `${pathname}${search}`);
      }
      return redirectWithCookies(teamLoginUrl, response);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return redirectWithCookies(loginUrl, response);
  }

  if (user) {
    const hasAuthErrorParam = request.nextUrl.searchParams.has("error");

    if (isTeamRoute(pathname) && pathname !== "/team/login") {
      const { data: ownProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle<{ id: string }>();

      if (!profileErr && ownProfile) {
        const teamLoginUrl = request.nextUrl.clone();
        teamLoginUrl.pathname = "/team/login";
        teamLoginUrl.search = "";
        teamLoginUrl.searchParams.set("error", "organiser_account");
        return redirectWithCookies(teamLoginUrl, response);
      }

      const { data: isActiveTeam, error: teamRpcErr } = await supabase.rpc(
        "is_active_team_session",
      );

      if (profileErr || teamRpcErr || isActiveTeam !== true) {
        const { error: signOutErr } = await supabase.auth.signOut({
          scope: "local",
        });
        if (signOutErr) {
          console.error("[team-auth] proxy local sign-out cleanup failed");
        }
        const teamLoginUrl = request.nextUrl.clone();
        teamLoginUrl.pathname = "/team/login";
        teamLoginUrl.search = "";
        teamLoginUrl.searchParams.set("error", "session_ended");
        return redirectWithCookies(teamLoginUrl, response);
      }

      return response;
    }

    if (pathname === "/team/login" && !hasAuthErrorParam) {
      const { data: ownProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle<{ id: string }>();

      if (!profileErr && !ownProfile) {
        const { data: isActiveTeam, error: teamRpcErr } = await supabase.rpc(
          "is_active_team_session",
        );

        if (!teamRpcErr && isActiveTeam === true) {
          const nextPath = sanitizeTeamRedirectPath(
            request.nextUrl.searchParams.get("next"),
            "/team",
          );
          const teamHomeUrl = request.nextUrl.clone();
          teamHomeUrl.pathname = nextPath;
          teamHomeUrl.search = "";
          return redirectWithCookies(teamHomeUrl, response);
        }
      }

      return response;
    }

    if (pathname === "/login" && !hasAuthErrorParam) {
      const { data: ownProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, is_active")
        .eq("id", user.id)
        .maybeSingle<{ id: string; is_active: boolean }>();

      if (!profileErr && ownProfile?.is_active) {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = "/";
        homeUrl.search = "";
        return redirectWithCookies(homeUrl, response);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

