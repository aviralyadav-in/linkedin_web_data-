import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

// Optional password for the whole dashboard (pages and /api/scraper). On a public server set
// DASHBOARD_USER and DASHBOARD_PASSWORD in .env; without them (local use) nothing is asked.
const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export function proxy(request: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!user && !password) return NextResponse.next();
  // Only one of them is set, or the password came out empty (Next's .env loader turns "$ecret" into "",
  // see the README): refuse instead of silently leaving the dashboard open.
  if (!user || !password) {
    return new NextResponse(
      "Dashboard login is misconfigured: .env needs both DASHBOARD_USER and DASHBOARD_PASSWORD " +
        "(write $ in the password as \\$).",
      { status: 500 },
    );
  }

  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    // both checks always run, so the response time doesn't reveal which part was wrong
    const userOk = colon >= 0 && same(decoded.slice(0, colon), user);
    const passwordOk = colon >= 0 && same(decoded.slice(colon + 1), password);
    if (userOk && passwordOk) return NextResponse.next();
  }
  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LinkedIn Contacts", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
