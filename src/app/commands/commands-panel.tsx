"use client";

import Link from "next/link";
import { type FormEvent, Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  CommandField,
  CommandsResponse,
  FieldName,
  Run,
  RunLog,
  RunStatus,
  ScraperStatus,
} from "@/lib/scraper-types";

import { authorsHref, authorsResult } from "../comments/authors/authors-result";
import { commentsHref, commentsResult } from "../comments/comments-result";
import PageTabs from "../page-tabs";

const MAX_LOG_LINES = 3000;
const DEFAULT_MAX = 500;
// linkedin_feed.py's own defaults and flags, used until the API has answered
const FALLBACK_FIELDS: CommandField[] = [
  { name: "scrolls", flag: "--scrolls", default: 10, label: "", help: "" },
  { name: "commented_posts", flag: "--commented-posts", default: 20, label: "", help: "" },
  { name: "author_posts", flag: "--author-posts", default: 10, label: "", help: "" },
  { name: "author_comments", flag: "--author-comments", default: 10, label: "", help: "" },
];

type Toggleable = "commented_posts" | "author_posts" | "author_comments";

// The scraper's four steps. The API's own labels are Hinglish, so the page keeps its English copy here.
const STEPS: {
  field: FieldName;
  n: number;
  title: string;
  description: string;
  unit: string;
  hint?: string;
}[] = [
  {
    field: "scrolls",
    n: 1,
    title: "Home feed",
    description: "Scrolls your LinkedIn feed and reads every post.",
    unit: "scrolls",
    hint: "0 reads the first screen only.",
  },
  {
    field: "commented_posts",
    n: 2,
    title: "Posts you commented on",
    description: "Opens them and reads every comment. Your own comments are skipped.",
    unit: "posts",
  },
  {
    field: "author_posts",
    n: 3,
    title: "More posts by those authors",
    description: "Other posts by the people or companies who wrote the step 2 posts.",
    unit: "per author",
  },
  {
    field: "author_comments",
    n: 4,
    title: "Posts those authors commented on",
    description: "Posts where the step 2 authors left a comment. People only, not companies.",
    unit: "per author",
  },
];
const STEP_TITLE: Record<string, string> = Object.fromEntries(STEPS.map((s) => [String(s.n), s.title]));

const ICONS = {
  back: "M19 12H5m7-7-7 7 7 7",
  play: "M6 4v16l14-8L6 4Z",
  stop: "M6 6h12v12H6z",
  terminal: "m4 17 6-6-6-6m8 14h8",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4m0 4h.01",
  x: "M18 6 6 18M6 6l12 12",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l4 2",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  copy: "M9 11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9ZM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  check: "M20 6 9 17l-5-5",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
  sliders: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  search: "m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3",
  external: "M15 3h6v6m0-6L10 14m8-1v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  reply: "m9 17-5-5 5-5M20 18v-2a4 4 0 0 0-4-4H4",
};

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export const STATUS: Record<RunStatus, { label: string; className: string }> = {
  running: { label: "Running", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  succeeded: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  stopped: { label: "Stopped", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  interrupted: { label: "Interrupted", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export const TYPE_LABEL: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
};

export const TYPE_BADGE: Record<string, string> = {
  email: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  phone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  whatsapp: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  telegram: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  linkedin: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950";
export const PRIMARY = `${BUTTON} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`;
export const SECONDARY = `${BUTTON} border border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500`;
export const CARD = "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";
export const EYEBROW = "text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400";

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

// "token": the API answers but rejects SCRAPER_API_TOKEN; "offline": it can't be reached at all
export type Link = "online" | "offline" | "token";
export const linkFromError = (e: unknown): Link => (e instanceof ApiError && e.status === 401 ? "token" : "offline");

// Calls go to this app's /api/scraper/* routes, which add the API token on the server.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/scraper/${path}`, {
      cache: "no-store",
      ...init,
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError(0);
  }
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

type Action = "start" | "stop" | "session";

// The API's own error messages are Hinglish, so the page explains each status code itself.
function errorText(e: unknown, action: Action, max: number) {
  const status = e instanceof ApiError ? e.status : 0;
  if (status === 409) {
    return action === "stop"
      ? "This run has already finished."
      : "Another command is already running. Wait for it to finish, or stop it first.";
  }
  if (status === 422) {
    return action === "session"
      ? "This isn't a LinkedIn session file, or it has no login cookie (li_at). Export it again on the PC where you're logged in."
      : `Each value must be a whole number from 0 to ${max}.`;
  }
  if (status === 404) {
    return action === "stop"
      ? "That run no longer exists."
      : "The scraper API doesn't know this command. Restart it so it runs the latest api.py.";
  }
  if (status === 401) return "The API token doesn't match: SCRAPER_API_TOKEN must equal API_TOKEN in linkedin-2/.env.";
  if (status === 403) return "The request was blocked. Reload the page and try again.";
  if (status === 500) return "The scraper API couldn't start the command. Check the API's own output for details.";
  if (status === 0 || status === 502 || status === 503) return "Can't reach the scraper API. Is it running?";
  return `Something went wrong (HTTP ${status}).`;
}

function cli(fields: CommandField[], values: Record<FieldName, number>) {
  const flags = fields.filter((f) => values[f.name] !== f.default).map((f) => `${f.flag} ${values[f.name]}`);
  return ["python linkedin_feed.py", ...flags].join(" ");
}

// A short English name for a run, from its values (the API's titles are Hinglish).
function runName(run: Run) {
  if (run.kind === "session_import") return "LinkedIn session import";
  if (run.kind === "session_check") return "LinkedIn login check";
  if (run.kind === "comments") {
    return `${run.contacts_only ? "Contacts from comments" : "Comments"}: ${run.username ?? "a profile"}`;
  }
  if (run.kind === "authors") return `Authors' contacts: ${run.username ?? "a profile"}`;
  const v = run.values;
  if (!v) return "Scraper run";
  if (v.commented_posts === 0) return v.scrolls === 0 ? "Feed only · first screen" : "Feed only";
  if (v.author_posts > 0 && v.author_comments > 0) return "All 4 steps";
  if (v.author_posts > 0) return "Steps 1, 2 & 3";
  return v.author_comments > 0 ? "Steps 1, 2 & 4" : "Steps 1 & 2";
}

// a User comments run's count for the history: its comments, or the contacts found in them
const commentsCount = (run: Run) =>
  run.contacts_only || run.kind === "authors" ? `${run.contacts_found ?? 0} contacts` : `${run.comments_found ?? 0} comments`;

function phaseLabel(phase: string | null) {
  const n = /^Step (\d)/.exec(phase ?? "")?.[1];
  return n && STEP_TITLE[n] ? `Step ${n} · ${STEP_TITLE[n]}` : phase;
}

export const plural = (n: string, word: string) => `${n} ${word}${n === "1" ? "" : "s"}`;

// linkedin_feed.py's post labels: "post 3/20", "author 2 post 1/10", "author 2 commented post 1/10"
function postLabel(label: string) {
  const own = /^post (\d+)\/(\d+)$/.exec(label);
  if (own) return `Post ${own[1]} of ${own[2]}`;
  const byAuthor = /^author (\d+) (?:commented )?post (\d+)\/(\d+)$/.exec(label);
  return byAuthor ? `Author ${byAuthor[1]} · post ${byAuthor[2]} of ${byAuthor[3]}` : null;
}

// The scraper's progress lines, shown shorter and friendlier (the raw log stays as it is).
function progressText(line: string | null) {
  const s = line?.trim() ?? "";
  let m = /^feed scroll (\d+)\/(\d+): (\d+) posts? read$/.exec(s);
  if (m) return `Scroll ${m[1]} of ${m[2]} · ${plural(m[3], "post")} read`;
  if ((m = /^(\d+) posts? found that you commented on$/.exec(s))) {
    return `Found ${plural(m[1], "post")} you commented on`;
  }
  if ((m = /^author (\d+)\/(\d+) \S+: (\d+) posts? found( that they commented on)?$/.exec(s))) {
    return `Author ${m[1]} of ${m[2]} · ${plural(m[3], "post")} ${m[4] ? "they commented on" : "found"}`;
  }
  if ((m = /^(.+?): (?:(\d+) comments? read|(didn't load, skipped)|already read this post, skipped)$/.exec(s))) {
    const label = postLabel(m[1]);
    if (!label) return null;
    if (m[2] !== undefined) return `${label} · ${plural(m[2], "comment")} read`;
    return `${label} · ${m[3] ? "didn't load, skipped" : "already read, skipped"}`;
  }
  return null;
}

// linkedin_session.py exits 0 = logged in, 3 = not logged in, 2 = bad file, 4 = LinkedIn didn't open
function sessionResult(run: Run) {
  const importing = run.kind === "session_import";
  if (run.status === "running") return importing ? "Importing the session..." : "Checking the LinkedIn login...";
  if (run.status === "succeeded") {
    return importing ? "Session imported. LinkedIn login works on this machine." : "LinkedIn login works on this machine.";
  }
  if (run.exit_code === 3) {
    return importing
      ? "Cookies imported, but LinkedIn isn't logged in. The session has probably expired: export it again."
      : "Not logged in to LinkedIn on this machine.";
  }
  if (run.exit_code === 2) return "The session file isn't valid.";
  if (run.exit_code === 4) {
    return importing
      ? "Cookies imported, but LinkedIn didn't open to check them (usually an internet or DNS problem). Run Check login once the connection works."
      : "LinkedIn didn't open. This is usually an internet or DNS problem, not the login: check the connection and try again.";
  }
  return run.status === "stopped" ? "Stopped." : "Didn't finish. See the output below.";
}

export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

function roughTime(seconds: number) {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h >= 48) return `${Math.round(h / 24)} days`;
  if (h >= 10) return `${h} h`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

const clockTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

const subscribeNothing = () => () => {};

// Formatted in the browser only: the server's timezone and locale (UTC on a Linux server) would show the
// wrong time, and hydration keeps server-rendered text as it is.
export function LocalTime({ epoch }: { epoch: number }) {
  return useSyncExternalStore(subscribeNothing, () => clockTime(epoch), () => "");
}

// a clock that ticks only while something is running, for the elapsed-time label
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

type View = { run: Run; lines: string[]; next: number; loaded: boolean; gone?: boolean };

type Props = {
  configured: boolean;
  initialLink: Link;
  initialCommands: CommandsResponse | null;
  initialStatus: ScraperStatus | null;
  initialRuns: Run[] | null; // null: the history couldn't be loaded, the page asks again
  // "commands": the run form, the run panel and the history; "settings": the LinkedIn login card and the run panel,
  // which there follows only the login jobs (session upload and check)
  page?: "commands" | "settings";
};

const SESSION_KINDS: Run["kind"][] = ["session_import", "session_check"];

// Is this run one the page's run panel follows? On the settings page only the login jobs (session upload, check).
function shownOn(page: "commands" | "settings", run: Run | null | undefined): run is Run {
  return !!run && (page === "commands" || SESSION_KINDS.includes(run.kind));
}

export default function CommandsPanel({
  configured,
  initialLink,
  initialCommands,
  initialStatus,
  initialRuns,
  page = "commands",
}: Props) {
  const [commands, setCommands] = useState(initialCommands);
  const [status, setStatus] = useState(initialStatus);
  const [link, setLink] = useState(initialLink);
  const [runs, setRuns] = useState(initialRuns ?? []);
  // the run whose logs are on screen: the running one, else the last one, else one picked from history (on the
  // settings page: the newest login job)
  const [view, setView] = useState<View | null>(() => {
    const run = [initialStatus?.current, initialStatus?.last, ...(page === "settings" ? (initialRuns ?? []) : [])]
      .find((r) => shownOn(page, r));
    return run ? { run, lines: [], next: 0, loaded: false } : null;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const busy = status?.busy ?? false;
  const busyRef = useRef(busy);
  const viewIdRef = useRef(view?.run.id);
  // the newest job this tab has switched to; a history row the user opens stays until a new job starts
  const followedRef = useRef(initialStatus?.current?.id);
  // refs, not state: the poll below must not restart (and drop answers in flight) when these load
  const runsLoadedRef = useRef(initialRuns !== null);
  const commandsLoadedRef = useRef(initialCommands !== null);
  // the running and the newest finished job the status poll last saw: when either changes, history is stale
  const seenRef = useRef(`${initialStatus?.current?.id}|${initialStatus?.last?.id}`);
  const lastIdRef = useRef(initialStatus?.last?.id);
  // asks the status poll for a fresh answer now instead of at its next (up to 6 s away) turn
  const pollSoonRef = useRef(() => {});
  const panelRef = useRef<HTMLElement>(null);

  const fields = commands?.fields.length ? commands.fields : FALLBACK_FIELDS;
  const maxValue = commands?.max_value ?? DEFAULT_MAX;
  const defaults = Object.fromEntries(fields.map((f) => [f.name, f.default])) as Record<FieldName, number>;

  function show(run: Run) {
    if (run.id === viewIdRef.current) return; // already on screen, its log is loaded or loading
    viewIdRef.current = run.id;
    setView({ run, lines: [], next: 0, loaded: false });
  }

  // On a phone the run panel sits between the form and the history, often off screen: bring it into view.
  // On a wide screen it is sticky and already visible, so nothing moves.
  function reveal() {
    requestAnimationFrame(() => {
      const top = panelRef.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 0 || top > window.innerHeight * 0.6)) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function open(run: Run) {
    show(run);
    reveal();
  }

  // Poll the API status: fast while a job runs, slow when idle, not at all in a hidden tab.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    let soon = false;
    const tick = async () => {
      inFlight = true;
      if (!document.hidden) {
        try {
          const s = await api<ScraperStatus>("status");
          if (cancelled) return;
          setLink("online");
          setStatus(s);
          const prevLast = lastIdRef.current;
          lastIdRef.current = s.last?.id;
          // a new job (from here, another tab or the other machine) -> follow its logs
          const opened = [s.current, s.last].find((r) => shownOn(page, r));
          if (s.current && s.current.id !== followedRef.current) {
            followedRef.current = s.current.id;
            if (shownOn(page, s.current)) show(s.current);
          } else if (!viewIdRef.current && opened) {
            show(opened); // page opened while the API was down
          } else if (
            // a job started and ended between two polls (or while this tab was hidden): show it, unless the
            // user is reading an older run they picked from the history
            !s.current &&
            shownOn(page, s.last) &&
            s.last.id !== prevLast &&
            s.last.id !== followedRef.current &&
            (viewIdRef.current === prevLast || viewIdRef.current === followedRef.current)
          ) {
            followedRef.current = s.last.id;
            show(s.last);
          }
          // the job on screen just ended: show its final record (end time, exit code) right away
          const ended = busyRef.current && !s.busy ? s.last : null;
          if (ended && ended.id === viewIdRef.current) {
            setView((v) => (v && v.run.id === ended.id ? { ...v, run: ended } : v));
          }
          // history: when a job starts or ends, and once after the page was opened while the API was down
          const seen = `${s.current?.id}|${s.last?.id}`;
          if (!runsLoadedRef.current || seen !== seenRef.current) {
            seenRef.current = seen;
            api<{ runs: Run[] }>("runs").then(
              (r) => {
                runsLoadedRef.current = true;
                setRuns(r.runs);
              },
              () => {
                runsLoadedRef.current = false; // try again at the next poll
              },
            );
          }
          busyRef.current = s.busy;
          if (!commandsLoadedRef.current) {
            api<CommandsResponse>("commands").then(
              (c) => {
                commandsLoadedRef.current = true;
                setCommands(c);
              },
              () => {},
            );
          }
        } catch (e) {
          if (!cancelled) setLink(linkFromError(e));
        }
      }
      inFlight = false;
      if (!cancelled) timer = setTimeout(tick, soon ? 300 : busyRef.current ? 2000 : 6000);
      soon = false;
    };
    pollSoonRef.current = () => {
      if (inFlight) {
        soon = true; // let the answer on its way arrive first, then ask again
        return;
      }
      clearTimeout(timer);
      if (!cancelled) timer = setTimeout(tick, 300);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [configured, page]);

  // Follow the log of the run on screen until it has finished.
  const viewId = view?.run.id;
  useEffect(() => {
    if (!viewId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let next = 0;
    let settling = 0;
    let sawRunning = false;
    const tick = async () => {
      try {
        const data = await api<RunLog>(`runs/${viewId}?since=${next}`);
        if (cancelled) return;
        next = data.next;
        setView((v) =>
          v && v.run.id === viewId
            ? { run: data.run, lines: [...v.lines, ...data.lines].slice(-MAX_LOG_LINES), next: data.next, loaded: true }
            : v,
        );
        // A stopped run is "stopped" before its process has exited; its end time and last lines come a moment
        // later, so keep asking for a while.
        const settled = data.run.status !== "stopped" || data.run.ended_at !== null || ++settling > 20;
        if (data.run.status === "running") sawRunning = true;
        else if (settled) {
          // it ended while on screen: update the busy state (badge, Start run) now, not at the next idle poll
          if (sawRunning) pollSoonRef.current();
          return;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          // the API no longer has this run (e.g. its runs/ folder was cleared): stop asking
          if (!cancelled) {
            setView((v) =>
              v && v.run.id === viewId
                ? {
                    ...v,
                    loaded: true,
                    gone: true,
                    run: v.run.status === "running" ? { ...v.run, status: "interrupted" } : v.run,
                  }
                : v,
            );
          }
          return;
        }
        // API briefly unreachable: keep trying
      }
      if (!cancelled) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewId]);

  async function start(key: string, action: Action, request: () => Promise<Run>) {
    setPending(key);
    setMessage(null);
    try {
      const run = await request();
      busyRef.current = true;
      followedRef.current = run.id;
      setStatus((s) => ({ busy: true, current: run, last: s?.last ?? null }));
      open(run);
      pollSoonRef.current(); // switch the status poll to its fast, running pace
    } catch (e) {
      setMessage(errorText(e, action, maxValue));
    } finally {
      setPending(null);
    }
  }

  async function stop() {
    const id = status?.current?.id;
    if (!id) return;
    setPending("stop");
    try {
      const run = await post<Run>(`runs/${id}/stop`);
      setStatus((s) => (s ? { ...s, current: run } : s));
    } catch (e) {
      setMessage(errorText(e, "stop", maxValue));
    } finally {
      setPending(null);
    }
  }

  async function uploadSession(file: File) {
    let body: unknown;
    try {
      body = JSON.parse(await file.text());
    } catch {
      setMessage("That isn't a JSON file. Pick the linkedin_session.json file made by the export command.");
      return;
    }
    start("session", "session", () => post<Run>("session/import", body));
  }

  const current = status?.current ?? null;
  const offline = configured && link !== "online";
  const blocked = busy || offline || pending !== null;

  return (
    <div className="w-full">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="flex w-full flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="rounded-lg border border-zinc-200 p-2 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
            aria-label="Back to contacts"
          >
            <Icon name="back" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold tracking-tight">{page === "settings" ? "Settings" : "Commands"}</h1>
            <p className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-400">
              {page === "settings" ? "LinkedIn login on a server" : "Run the LinkedIn scraper without a terminal"}
            </p>
          </div>
          <PageTabs active={page === "commands" ? "commands" : undefined} />
          <ApiBadge configured={configured} link={link} busy={busy} />
        </div>
      </header>

      {/* fixed at the bottom, so an error is seen wherever the button that caused it was on the page */}
      {message && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            <Icon name="x" />
          </button>
        </div>
      )}

      <div className="w-full px-4 py-6 sm:px-6">
        {!configured ? (
          <Notice title="The scraper API isn't set up">
            Add <Code>SCRAPER_API_URL</Code> and <Code>SCRAPER_API_TOKEN</Code> to <Code>linkedin-data/.env</Code> (the
            token is <Code>API_TOKEN</Code> from <Code>linkedin-2/.env</Code>), then restart this app.
          </Notice>
        ) : (
          // grid-cols-1 = minmax(0, 1fr): long log/command lines wrap or scroll inside their box instead of widening
          // the page. On a phone the order is form, run panel, history; on a wide screen the panel sits on the right,
          // with a 60:40 split between the left cards and the right run panel.
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-6">
              {link === "offline" && (
                <Notice title="Can't reach the scraper API">
                  Start it in the <Code>linkedin-2</Code> folder with <Code>python api.py</Code> (on a server:{" "}
                  <Code>sudo systemctl restart linkedin-api</Code>). This page keeps retrying on its own.
                </Notice>
              )}
              {link === "token" && (
                <Notice title="The API token doesn't match">
                  The API is running but rejects this app&apos;s token. <Code>SCRAPER_API_TOKEN</Code> in{" "}
                  <Code>linkedin-data/.env</Code> must equal <Code>API_TOKEN</Code> in <Code>linkedin-2/.env</Code>.
                  Restart both apps after changing it.
                </Notice>
              )}

              {page === "settings" ? (
                <SessionTools
                  disabled={blocked}
                  onUpload={uploadSession}
                  onCheck={() => start("check", "session", () => post<Run>("session/check"))}
                />
              ) : (
                <RunForm
                  fields={fields}
                  defaults={defaults}
                  maxValue={maxValue}
                  blockedReason={
                    link === "token"
                      ? "The scraper API rejects this app's token (see above)."
                      : offline
                        ? "The scraper API isn't reachable right now."
                        : busy
                          ? "A run is in progress. Wait for it to finish, or stop it."
                          : null
                  }
                  blocked={blocked}
                  starting={pending === "run"}
                  onRun={(values) => start("run", "start", () => post<Run>("runs", { command_id: "custom", values }))}
                />
              )}
            </div>

            {/* scroll-mt clears the sticky header, which is two rows (title, tabs) on a phone */}
            <aside
              ref={panelRef}
              className="min-w-0 scroll-mt-32 sm:scroll-mt-20 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1"
              aria-label="Run status"
            >
              <RunPanel
                view={view}
                current={current}
                link={link}
                stopping={pending === "stop" || current?.status === "stopped"}
                onStop={stop}
                onShow={open}
                page={page}
              />
            </aside>

            {page === "commands" && (
              <div className="min-w-0 space-y-6">
                <History runs={runs} viewId={view?.run.id} onShow={open} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// A long command wraps between its arguments, never inside one like "--commented-posts".
function CommandText({ command }: { command: string }) {
  return command.split(" ").map((part, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{children}</code>;
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-center gap-2 font-semibold">
        <Icon name="alert" />
        {title}
      </div>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}

export function ApiBadge({ configured, link, busy }: { configured: boolean; link: Link; busy: boolean }) {
  const [label, dot] = !configured
    ? ["Not set up", "bg-zinc-400"]
    : link === "token"
      ? ["Token mismatch", "bg-amber-500"]
      : link === "offline"
        ? ["API offline", "bg-red-500"]
        : busy
          ? ["Running", "bg-sky-500 animate-pulse"]
          : ["API online", "bg-emerald-500"];
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium dark:border-zinc-700">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: RunStatus }) {
  const s = STATUS[status] ?? STATUS.interrupted;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // the transparent borders become visible lines in Windows contrast themes, which drop background colours
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:opacity-40 dark:focus-visible:ring-offset-zinc-950 ${
        checked ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full border border-transparent bg-white shadow transition-transform dark:bg-zinc-900 ${
          checked ? "translate-x-[17px]" : "translate-x-px"
        }`}
      />
    </button>
  );
}

function Stepper({
  id,
  value,
  onChange,
  max,
  label,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  max: number;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const n = /^\d+$/.test(value.trim()) ? Number(value) : null;
  const set = (x: number) => onChange(String(Math.min(max, Math.max(0, x))));
  const side =
    "flex w-8 items-center justify-center text-base leading-none text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
  return (
    <div
      className={`inline-flex h-9 items-stretch overflow-hidden rounded-lg border bg-white focus-within:ring-2 focus-within:ring-zinc-300 dark:bg-zinc-900 dark:focus-within:ring-zinc-700 ${
        invalid ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-700"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className={side}
        aria-label={`Decrease ${label}`}
        disabled={disabled || n === null || n <= 0}
        onClick={() => set((n ?? 0) - 1)}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 border-x border-zinc-200 bg-transparent text-center text-sm font-medium tabular-nums outline-hidden [appearance:textfield] dark:border-zinc-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={side}
        aria-label={`Increase ${label}`}
        disabled={disabled || (n !== null && n >= max)}
        onClick={() => set((n ?? 0) + 1)}
      >
        +
      </button>
    </div>
  );
}

type Draft = Record<FieldName, string>;
type Enabled = Record<Toggleable, boolean>;

const isToggleable = (field: FieldName): field is Toggleable => field !== "scrolls";

function RunForm({
  fields,
  defaults,
  maxValue,
  blocked,
  blockedReason,
  starting,
  onRun,
}: {
  fields: CommandField[];
  defaults: Record<FieldName, number>;
  maxValue: number;
  blocked: boolean;
  blockedReason: string | null;
  starting: boolean;
  onRun: (values: Record<FieldName, number>) => void;
}) {
  const initialDraft = (): Draft => ({
    scrolls: String(defaults.scrolls),
    commented_posts: String(defaults.commented_posts),
    author_posts: String(defaults.author_posts),
    author_comments: String(defaults.author_comments),
  });
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [enabled, setEnabled] = useState<Enabled>({
    commented_posts: defaults.commented_posts > 0,
    author_posts: defaults.author_posts > 0,
    author_comments: defaults.author_comments > 0,
  });
  const [copied, setCopied] = useState(false);

  const parse = (raw: string) => (/^\d+$/.test(raw.trim()) && Number(raw) <= maxValue ? Number(raw) : null);
  const step2 = enabled.commented_posts;
  // step 2 set to 0 is the same as off: linkedin_feed.py then skips steps 2-4
  const step2Runs = step2 && parse(draft.commented_posts) !== 0;
  // Is a step's number used at all? Steps 3 and 4 only run after step 2.
  const active = (field: FieldName) =>
    field === "scrolls" || (field === "commented_posts" ? step2 : step2Runs && enabled[field as Toggleable]);
  const invalid = (field: FieldName) => active(field) && parse(draft[field]) === null;

  // What is sent: a switched-off step is 0. Without step 2, steps 3 and 4 never run, so they keep their
  // defaults and the command stays short (python linkedin_feed.py --commented-posts 0).
  const values = Object.fromEntries(
    fields.map((f) => {
      if (!isToggleable(f.name)) return [f.name, parse(draft.scrolls) ?? 0];
      if (f.name !== "commented_posts" && !step2Runs) return [f.name, defaults[f.name]];
      return [f.name, active(f.name) ? (parse(draft[f.name]) ?? 0) : 0];
    }),
  ) as Record<FieldName, number>;
  const hasErrors = fields.some((f) => invalid(f.name));
  const command = cli(fields, values);

  // Upper limits: every step 2 post by a different author, each author with enough posts. The feed takes
  // ~10 s plus ~4 s a scroll; an opened post ~40 s at most, unless it has hundreds of comments.
  const posts = values.commented_posts * (1 + values.author_posts + values.author_comments);
  const seconds = 10 + values.scrolls * 4 + posts * 40;

  function setValue(field: FieldName, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function toggle(field: Toggleable, on: boolean) {
    setEnabled((e) => ({ ...e, [field]: on }));
    // switching a step on while its number is 0 would still skip it
    if (on && parse(draft[field]) === 0) setValue(field, String(defaults[field] || 1));
  }

  function reset() {
    setDraft(initialDraft());
    setEnabled({
      commented_posts: defaults.commented_posts > 0,
      author_posts: defaults.author_posts > 0,
      author_comments: defaults.author_comments > 0,
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. plain http on another device): the command is still selectable
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!blocked && !hasErrors) onRun(values);
  }

  return (
    <form onSubmit={submit} className={CARD} aria-labelledby="run-form-title">
      <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
          <Icon name="zap" />
        </span>
        <div className="min-w-0">
          <h2 id="run-form-title" className="text-sm font-semibold">
            New run
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Choose what the scraper reads. Every email, phone number, WhatsApp and Telegram contact it finds, and
            every LinkedIn profile mentioned, is saved to the database right away.
          </p>
        </div>
      </div>

      <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {STEPS.map((step) => {
          const toggleable = isToggleable(step.field);
          const needsStep2 = step.n > 2 && !step2Runs;
          const on = active(step.field);
          const inputId = `run-${step.field}`;
          const hintId = `${inputId}-hint`;
          const unitId = `${inputId}-unit`;
          return (
            <li
              key={step.field}
              className={`flex flex-col gap-3 px-4 py-4 transition-opacity sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
                on ? "" : "opacity-60"
              }`}
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    on
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {step.n}
                </span>
                <div className="min-w-0">
                  <label htmlFor={inputId} className="text-sm font-medium">
                    {step.title}
                  </label>
                  <p id={hintId} className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {step.description}
                    {step.hint && ` ${step.hint}`}
                    {needsStep2 && (
                      <span className="block text-amber-700 dark:text-amber-400">
                        {step2 ? "Step 2 is set to 0, so this step won't run." : "Turn on step 2 to use this."}
                      </span>
                    )}
                    {invalid(step.field) && (
                      <span className="block text-red-600 dark:text-red-400">
                        Enter a whole number from 0 to {maxValue}.
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-9 sm:pl-0">
                {toggleable && (
                  <Switch
                    checked={!needsStep2 && enabled[step.field as Toggleable]}
                    onChange={(next) => toggle(step.field as Toggleable, next)}
                    label={`Step ${step.n}: ${step.title}`}
                    disabled={needsStep2}
                  />
                )}
                <Stepper
                  id={inputId}
                  value={draft[step.field]}
                  onChange={(v) => setValue(step.field, v)}
                  max={maxValue}
                  label={step.title}
                  disabled={!on}
                  invalid={invalid(step.field)}
                  describedBy={`${unitId} ${hintId}`}
                />
                <span id={unitId} className="w-16 text-xs text-zinc-500 dark:text-zinc-400">
                  {step.unit}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 border-t border-zinc-200 bg-zinc-50/60 px-4 py-4 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <dt className="text-zinc-500 dark:text-zinc-400">Posts opened after the feed</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {hasErrors ? "–" : posts ? `up to ${posts.toLocaleString("en")}` : "none"}
              </dd>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <dt className="text-zinc-500 dark:text-zinc-400">Rough time</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {hasErrors ? "–" : `${posts ? "up to " : ""}~${roughTime(seconds)}`}
              </dd>
            </div>
          </dl>
          {posts > 0 && !hasErrors && (
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Upper limits: a run ends sooner when there are fewer posts to read.
            </p>
          )}
        </div>

        {seconds > 12 * 3600 && !hasErrors && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This could keep LinkedIn open for a very long time. Smaller numbers finish sooner and look less like
            automation to LinkedIn.
          </p>
        )}

        <div>
          <div className={EYEBROW}>Same as this terminal command</div>
          <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-zinc-900 py-2 pr-2 pl-3 font-mono text-xs leading-5 text-zinc-100 dark:bg-black">
            <span className="text-zinc-500">$</span>
            <code className="min-w-0 flex-1 break-words">
              {/* invalid values would show up as 0 here, a different command from the one typed */}
              {hasErrors ? (
                <span className="text-zinc-400">Fix the highlighted values first</span>
              ) : (
                <CommandText command={command} />
              )}
            </code>
            <button
              type="button"
              onClick={copy}
              disabled={hasErrors}
              className="-my-0.5 shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
              aria-label={copied ? "Command copied" : "Copy command"}
              title={copied ? "Copied" : "Copy"}
            >
              <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={reset} className={SECONDARY}>
            <Icon name="reset" />
            Reset to defaults
          </button>
          <button type="submit" disabled={blocked || hasErrors} className={`${PRIMARY} sm:min-w-40`}>
            <Icon name="play" />
            {starting ? "Starting..." : "Start run"}
          </button>
        </div>
        {(blockedReason || hasErrors) && (
          <p className="text-right text-xs text-zinc-500 dark:text-zinc-400">
            {blockedReason ?? "Fix the highlighted values to start."}
          </p>
        )}
      </div>
    </form>
  );
}

function RunPanel({
  view,
  current,
  link,
  stopping,
  onStop,
  onShow,
  page,
}: {
  view: View | null;
  current: Run | null;
  link: Link;
  stopping: boolean;
  onStop: () => void;
  onShow: (run: Run) => void;
  page: "commands" | "settings";
}) {
  const run = view?.run ?? null;
  const running = run?.status === "running";
  // after Stop the run is "stopped" while its process is still exiting: keep the clock going until it has ended
  const ending = run?.status === "stopped" && run.ended_at === null && current?.id === run.id;
  const now = useNow(running || ending);
  const logRef = useRef<HTMLPreElement>(null);
  const stickToBottom = useRef(true);
  const shownId = run?.id;
  const lastShownId = useRef(shownId);
  // grows with every new line, also once the on-screen log is capped at MAX_LOG_LINES
  const received = view?.next ?? 0;

  // keep the newest log line in view, unless the user has scrolled up to read this run's log
  useEffect(() => {
    if (lastShownId.current !== shownId) {
      lastShownId.current = shownId;
      stickToBottom.current = true; // another run: having scrolled up in the previous one doesn't count
    }
    const el = logRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [received, shownId]);

  // Screen readers hear status changes only, not the ticking timer and the streaming log. The live region
  // stays mounted when the first run appears, or that change would not be announced.
  const live = (
    <p className="sr-only" aria-live="polite">
      {run
        ? `${runName(run)}: ${STATUS[run.status]?.label ?? run.status}${run.login_required && running ? ", LinkedIn login needed" : ""}`
        : ""}
    </p>
  );

  if (!run) {
    return (
      <>
        {live}
        <section className={`${CARD} p-5`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="terminal" />
            {link === "online" ? "No runs yet" : link === "token" ? "Runs can't be loaded" : "Waiting for the scraper API"}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {link === "online" && page === "settings" ? (
              <>
                Upload a session file or press{" "}
                <strong className="font-medium text-zinc-700 dark:text-zinc-300">Check login</strong>. Progress and the
                output show up here.
              </>
            ) : link === "online" ? (
              <>
                Pick the steps and press{" "}
                <strong className="font-medium text-zinc-700 dark:text-zinc-300">Start run</strong>. Progress and the
                scraper&apos;s output show up here.
              </>
            ) : link === "token" ? (
              "They show up here once the API token matches."
            ) : (
              "The current run and the scraper's output show up here once the API is reachable."
            )}
          </p>
        </section>
      </>
    );
  }

  const isCurrent = current?.id === run.id;
  // a run cut off by an API restart ("interrupted") has no end time: its length is unknown
  const end = running || ending ? now / 1000 : run.ended_at;
  const elapsed = end === null ? null : end - run.started_at;
  const scrape = run.kind === "scrape";
  const comments = run.kind === "comments";
  const authors = run.kind === "authors"; // User comments account data
  const progress = progressText(run.progress);
  const elsewhere = current?.status === "running" && !isCurrent ? current : null;

  return (
    <>
      {live}
      {/* on a wide screen the sticky panel fits the window: the log shrinks instead of running below the fold,
          and on a very short window the panel itself scrolls rather than cutting the log off */}
      <section className={`${CARD} flex flex-col overflow-y-auto lg:max-h-[calc(100dvh-6rem)]`}>
        {elsewhere && (
          <button
            type="button"
            onClick={() => onShow(elsewhere)}
            className="flex w-full shrink-0 items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-left text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-inset dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950"
          >
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
            <span className="flex-1">{runName(elsewhere)} is running</span>
            <span className="underline underline-offset-2">Show it</span>
          </button>
        )}
        <div className="shrink-0 space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={EYEBROW}>{isCurrent && running ? "Running now" : "Run details"}</div>
              <div className="mt-1 text-sm font-semibold">{runName(run)}</div>
              {run.command && (
                <code className="mt-1 block break-words font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  $ <CommandText command={run.command} />
                </code>
              )}
            </div>
            <StatusPill status={run.status} />
          </div>

          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="clock" className="h-3 w-3" />
                Elapsed
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums" suppressHydrationWarning>
                {elapsed === null ? "–" : duration(elapsed)}
              </dd>
            </div>
            <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="users" className="h-3 w-3" />
                {authors ? "Contacts" : comments ? (run.contacts_only ? "Contacts" : "Comments") : "New contacts"}
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {scrape
                  ? run.new_contacts
                  : authors
                    ? (run.contacts_found ?? 0)
                    : comments
                      ? ((run.contacts_only ? run.contacts_found : run.comments_found) ?? 0)
                      : "–"}
              </dd>
            </div>
            <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
              <dt className="text-zinc-500 dark:text-zinc-400">Started</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                <LocalTime epoch={run.started_at} />
              </dd>
            </div>
          </dl>

          {scrape && run.phase && (
            <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Icon name="flag" className="h-3.5 w-3.5 text-zinc-400" />
                {phaseLabel(run.phase)}
              </div>
              {progress && <div className="mt-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{progress}</div>}
            </div>
          )}
          {!scrape && (
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {authors ? authorsResult(run) : comments ? commentsResult(run) : sessionResult(run)}
            </p>
          )}
          {comments && (
            <Link href={commentsHref(run.id)} className="inline-flex text-xs font-medium underline-offset-2 hover:underline">
              Open in User comments
            </Link>
          )}
          {authors && (
            <Link href={authorsHref(run.id)} className="inline-flex text-xs font-medium underline-offset-2 hover:underline">
              Open in User comments account data
            </Link>
          )}

          {run.login_required && running && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-semibold">
                <Icon name="alert" className="h-3.5 w-3.5" />
                LinkedIn login needed
              </div>
              On your PC: log in to LinkedIn in the Chrome window that opened, and the run continues by itself. On a
              server: stop the run and upload a session file in{" "}
              <Link href="/settings" className="font-semibold underline underline-offset-2">
                Settings
              </Link>
              .
            </div>
          )}

          {run.recent_contacts.length > 0 && (
            <div>
              <div className={EYEBROW}>Found in this run</div>
              <ul className="mt-1.5 space-y-1">
                {run.recent_contacts.slice(0, 5).map((c, i) => (
                  // three on a wide screen, where the panel has to fit the window
                  <li
                    key={`${c.type}:${c.value}`}
                    className={`flex min-w-0 items-center gap-2 text-xs ${i > 2 ? "lg:hidden" : ""}`}
                  >
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[c.type] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
                    >
                      {TYPE_LABEL[c.type] ?? c.type}
                    </span>
                    <span className="truncate font-mono">{c.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!running && scrape && (
            <Link href="/" className="inline-flex text-xs font-medium underline-offset-2 hover:underline">
              Open contacts{run.db_total !== null ? ` (${run.db_total} in the database)` : ""}
            </Link>
          )}

          {isCurrent && running && (
            <button
              type="button"
              onClick={onStop}
              disabled={stopping}
              className={`${BUTTON} w-full border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40`}
            >
              <Icon name="stop" />
              {stopping ? "Stopping..." : "Stop run"}
            </button>
          )}
        </div>

        <div className="flex min-h-40 flex-[1_1_20rem] flex-col border-t border-zinc-200 lg:min-h-32 dark:border-zinc-800">
          <div className="flex shrink-0 items-center justify-between px-4 py-2">
            <span className={`${EYEBROW} flex items-center gap-1.5`}>
              <Icon name="terminal" className="h-3.5 w-3.5" />
              Scraper output
            </span>
            <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {/* an interrupted run's saved count stops where the API went down; its log file has them all */}
              {plural(String(Math.max(run.log_lines, received)), "line")}
            </span>
          </div>
          <pre
            ref={logRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
            }}
            className="min-h-0 flex-1 overflow-auto bg-zinc-950 px-4 py-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-200"
          >
            {view && view.lines.length > 0
              ? view.lines.join("\n")
              : view?.gone
                ? "This run is no longer on the scraper API."
                : !view?.loaded
                  ? "Loading output..."
                  : running
                    ? "Waiting for output..."
                    : "No output."}
          </pre>
        </div>
      </section>
    </>
  );
}

const HISTORY_ROWS = 5;
const HISTORY_MAX = 15;

function History({ runs, viewId, onShow }: { runs: Run[]; viewId?: string; onShow: (run: Run) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (runs.length === 0) return null;
  const total = Math.min(runs.length, HISTORY_MAX);
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className={`${EYEBROW} mb-3 flex items-center gap-1.5`}>
        <Icon name="history" className="h-3.5 w-3.5" />
        Recent runs
      </h2>
      <div className={`${CARD} overflow-hidden`}>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {runs.slice(0, expanded ? total : HISTORY_ROWS).map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onShow(run)}
                aria-current={run.id === viewId ? "true" : undefined}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${
                  run.id === viewId
                    ? "bg-zinc-100 shadow-[inset_3px_0_0_var(--color-zinc-900)] dark:bg-zinc-800/70 dark:shadow-[inset_3px_0_0_var(--color-zinc-100)]"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{runName(run)}</span>
                  <span className="block truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {run.command}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-zinc-500 sm:hidden dark:text-zinc-400">
                    <LocalTime epoch={run.started_at} />
                    {run.kind === "scrape" && ` · ${run.new_contacts} new`}
                    {(run.kind === "comments" || run.kind === "authors") && ` · ${commentsCount(run)}`}
                  </span>
                </span>
                <span className="hidden text-right text-xs tabular-nums text-zinc-500 sm:block dark:text-zinc-400">
                  <span className="block">
                    <LocalTime epoch={run.started_at} />
                  </span>
                  {run.kind === "scrape" && <span className="block">{run.new_contacts} new</span>}
                  {(run.kind === "comments" || run.kind === "authors") && (
                    <span className="block">{commentsCount(run)}</span>
                  )}
                </span>
                <StatusPill status={run.status} />
              </button>
            </li>
          ))}
        </ul>
        {total > HISTORY_ROWS && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="w-full border-t border-zinc-200 px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
          >
            {expanded ? "Show fewer" : `Show ${total - HISTORY_ROWS} more`}
          </button>
        )}
      </div>
    </section>
  );
}

function SessionTools({
  disabled,
  onUpload,
  onCheck,
}: {
  disabled: boolean;
  onUpload: (file: File) => void;
  onCheck: () => void;
}) {
  const exportCommand = "python linkedin_session.py export linkedin_session.json";
  return (
    <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="session-title">
      <h2 id="session-title" className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="shield" />
        LinkedIn login on a server
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        A server has no screen, so nobody can log in to LinkedIn in its Chrome window. Export your login once on the
        PC where you are logged in (in the <Code>linkedin-2</Code> folder), then upload the file here.
      </p>
      <pre className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap dark:bg-zinc-900">
        {exportCommand}
      </pre>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Delete the file after uploading: it gives full access to your LinkedIn account.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label
          className={`${SECONDARY} cursor-pointer focus-within:outline-hidden focus-within:ring-2 focus-within:ring-zinc-400 focus-within:ring-offset-2 dark:focus-within:ring-offset-zinc-950 ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <Icon name="upload" />
          Upload session file
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
        <button type="button" className={SECONDARY} disabled={disabled} onClick={onCheck}>
          <Icon name="shield" />
          Check login
        </button>
      </div>
    </section>
  );
}
