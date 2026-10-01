import "server-only";

// Talks to the linkedin-2 scraper API (api.py). The token stays on the server: browsers only
// ever call this app's /api/scraper/* routes, which forward here.

export function scraperConfigured() {
  return Boolean(process.env.SCRAPER_API_TOKEN);
}

export function scraperFetch(path: string, init: RequestInit = {}) {
  const base = (process.env.SCRAPER_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${process.env.SCRAPER_API_TOKEN ?? ""}`);
  return fetch(`${base}/api/${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
}
