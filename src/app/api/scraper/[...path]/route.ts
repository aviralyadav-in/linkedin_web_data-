import type { NextRequest } from "next/server";

import { scraperConfigured, scraperFetch } from "@/lib/scraper";

// Only these scraper API calls can be made from the browser.
const ID = "[\\w-]{1,64}";
const ALLOWED: Record<string, RegExp[]> = {
  GET: [
    /^commands$/,
    /^status$/,
    /^runs$/,
    new RegExp(`^runs/${ID}$`),
    /^help$/,
    /^session$/,
    new RegExp(`^comments/${ID}$`),
    new RegExp(`^authors/${ID}$`),
  ],
  POST: [
    /^runs$/,
    new RegExp(`^runs/${ID}/stop$`),
    /^session\/import$/,
    /^session\/check$/,
    /^session\/delete$/,
    /^comments$/,
    /^authors$/,
    // go on with a lookup that stopped part-way
    new RegExp(`^comments/${ID}/resume$`),
    new RegExp(`^authors/${ID}/resume$`),
  ],
};

const error = (detail: string, status: number) => Response.json({ detail }, { status });

// Another website can't make a visitor's browser start runs here: a cross-site request can't send
// application/json without a CORS preflight (which this route never answers), and its Origin
// wouldn't match this host.
function sameSite(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function forward(request: NextRequest, ctx: RouteContext<"/api/scraper/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!ALLOWED[request.method]?.some((re) => re.test(path))) return error("Not found", 404);
  if (request.method === "POST" && !sameSite(request)) return error("This request isn't allowed", 403);
  if (!scraperConfigured()) return error("SCRAPER_API_TOKEN isn't set in .env", 503);

  const since = request.nextUrl.searchParams.get("since");
  const query = since && /^\d+$/.test(since) ? `?since=${since}` : "";
  try {
    const res = await scraperFetch(path + query, {
      method: request.method,
      ...(request.method === "POST" && {
        body: await request.text(),
        headers: { "Content-Type": "application/json" },
      }),
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return error("Couldn't connect to the scraper API. Is `python api.py` running in the linkedin-2 folder?", 502);
  }
}

export const GET = forward;
export const POST = forward;
