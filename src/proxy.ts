import { NextResponse, type NextRequest } from "next/server";

import { dashboardLogin } from "@/lib/dashboard-auth";

// Optional password for the whole dashboard (pages, Server Actions and /api/scraper). On a public server set
// DASHBOARD_USER and DASHBOARD_PASSWORD in .env; without them (local use) nothing is asked.
export function proxy(request: NextRequest) {
  const login = dashboardLogin(request.headers.get("authorization"));
  if (login === "open" || login === "ok") return NextResponse.next();
  // Only one of them is set, or the password came out empty (Next's .env loader turns "$ecret" into "",
  // see the README): refuse instead of silently leaving the dashboard open.
  if (login === "misconfigured") {
    return new NextResponse(
      "Dashboard login is misconfigured: .env needs both DASHBOARD_USER and DASHBOARD_PASSWORD " +
        "(write $ in the password as \\$).",
      { status: 500 },
    );
  }
  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LinkedIn Contacts", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
