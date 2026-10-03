import { createHash, timingSafeEqual } from "node:crypto";

// The dashboard's optional login (DASHBOARD_USER / DASHBOARD_PASSWORD in .env). proxy.ts checks it for every
// request, and the Server Actions that change data check it again themselves.
const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** "open": no login is set up (local use). "misconfigured": only one of the two is set, or the password came out
 *  empty. Otherwise whether the request's Basic credentials (its Authorization header) are the right ones. */
export function dashboardLogin(authorization: string | null): "open" | "misconfigured" | "ok" | "denied" {
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!user && !password) return "open";
  if (!user || !password) return "misconfigured";

  const [scheme, encoded] = (authorization ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    // both checks always run, so the response time doesn't reveal which part was wrong
    const userOk = colon >= 0 && same(decoded.slice(0, colon), user);
    const passwordOk = colon >= 0 && same(decoded.slice(colon + 1), password);
    if (userOk && passwordOk) return "ok";
  }
  return "denied";
}
