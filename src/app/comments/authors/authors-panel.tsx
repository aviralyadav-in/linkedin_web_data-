"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hrefFor } from "@/lib/contact-links";
import type {
  AuthorEntry,
  AuthorLink,
  AuthorsResponse,
  AuthorsResult,
  Run,
  ScraperStatus,
  UserComment,
} from "@/lib/scraper-types";

import {
  ApiBadge,
  ApiError,
  BUTTON,
  CARD,
  Code,
  EYEBROW,
  Icon,
  type Link as ApiLink,
  LocalTime,
  Notice,
  PRIMARY,
  SECONDARY,
  STATUS,
  StatusPill,
  Switch,
  TYPE_BADGE,
  TYPE_LABEL,
  api,
  duration,
  linkFromError,
  post,
  useNow,
} from "../../commands/commands-panel";
import PageTabs from "../../page-tabs";
import {
  DEFAULT_LIMIT,
  MAX_COMMENTS,
  OutputLog,
  RUN_ID_RE,
  continuable,
  continueErrorText,
  parseProfile,
  profileUrl,
  safeUrl,
} from "../comments-panel";
import { authorsHref, authorsResult } from "./authors-result";

const PAGE = 50; // authors rendered at a time

// Which table columns are shown, chosen under Columns and kept in this browser; the CSV follows the same
// choice. The Author column always stays. Modelled as an external store so hydration is consistent: the
// server renders the default (every column on), and the browser switches to the saved choice right after.
type Cols = { status: boolean; contacts: boolean; comments: boolean; about: boolean };
const DEFAULT_COLS: Cols = { status: true, contacts: true, comments: true, about: true };
const COLS_KEY = "authors-table-cols-v1";
const COLUMN_OPTIONS: { key: keyof Cols; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "contacts", label: "Contacts" },
  { key: "comments", label: "Comments" },
  { key: "about", label: "About" },
];

// whatever is stored is checked field by field; anything unexpected falls back to shown
function readCols(): Cols {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
  } catch {
    return DEFAULT_COLS;
  }
  if (!raw || typeof raw !== "object") return DEFAULT_COLS;
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown) => (typeof v === "boolean" ? v : true);
  return { status: bool(r.status), contacts: bool(r.contacts), comments: bool(r.comments), about: bool(r.about) };
}

let colsCache: Cols | null = null;
const colsListeners = new Set<() => void>();
const getCols = () => (colsCache ??= readCols());
const getServerCols = () => DEFAULT_COLS;

function subscribeCols(cb: () => void) {
  colsListeners.add(cb);
  // changed in another tab (null: that tab cleared the storage)
  const onStorage = (e: StorageEvent) => {
    if (e.key === COLS_KEY || e.key === null) {
      colsCache = readCols();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    colsListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function saveCols(next: Cols) {
  colsCache = next;
  try {
    localStorage.setItem(COLS_KEY, JSON.stringify(next));
  } catch {
    // still applies to this page view, it just isn't remembered
  }
  colsListeners.forEach((l) => l());
}

// the counts in the result file are the real ones; the run's own counts can lag behind them
const withCount = (run: Run, result: AuthorsResult | null): Run =>
  result
    ? {
        ...run,
        comments_found: Math.max(run.comments_found ?? 0, result.comments_read ?? 0),
        authors_found: result.posts === null ? run.authors_found : result.authors.length,
        profiles_read: result.profiles_read,
        contacts_found: result.contacts.length,
      }
    : run;

const RESTART_API = "Restart the scraper API (python api.py) so it runs the latest api.py";

function errorText(e: unknown, unlimited = false) {
  const status = e instanceof ApiError ? e.status : 0;
  if (status === 409) return "Another command is already running. Wait for it to finish, or stop it first.";
  if (status === 422 && unlimited) return `The scraper API didn't accept Unlimited. ${RESTART_API}, then try again.`;
  if (status === 422) {
    return "Enter a LinkedIn username (like satyanadella) or a profile URL (linkedin.com/in/...), and up to 5000 comments.";
  }
  if (status === 404) return `The scraper API doesn't know User comments account data yet. ${RESTART_API}.`;
  if (status === 401) return "The API token doesn't match: SCRAPER_API_TOKEN must equal API_TOKEN in linkedin-2/.env.";
  if (status === 403) return "The request was blocked. Reload the page and try again.";
  if (status === 500) return "The scraper API couldn't start the lookup. Check the API's own output for details.";
  if (status === 0 || status === 502 || status === 503) return "Can't reach the scraper API. Is it running?";
  return `Something went wrong (HTTP ${status}).`;
}

const STATUS_TEXT: Record<AuthorEntry["status"], string> = {
  waiting: "Not read yet",
  read: "Profile read",
  not_found: "Profile not found",
  failed: "Didn't load",
  company: "Company page",
};

const CONTACT_INFO_TEXT: Record<string, string> = { read: "Read", none: "Not shown", failed: "Didn't load" };
const CSV_TYPES = ["email", "phone", "whatsapp", "telegram", "linkedin"] as const;

// a comment's links (a file from a short-lived version of the script kept the whole comment)
const asLink = (c: UserComment | AuthorLink): AuthorLink =>
  "post" in c ? { id: c.id, post_url: c.post.url, comment_url: c.url, date: c.date } : c;
const postLink = (c: UserComment | AuthorLink) => asLink(c).post_url;
const commentLink = (c: UserComment | AuthorLink) => asLink(c).comment_url;

// One row per author as an Excel sheet, with the columns the table shows: the Author column's identity cells
// always, then per chosen column its cells. An .xlsx, not a CSV, so the file opens cleanly: every column as
// wide as its content, every row one line (several links sit in one cell, separated by commas), the header
// bold and frozen, and numbers kept as text (no 9.18E+11). exceljs is loaded only when the button is pressed.
async function downloadXlsx(result: AuthorsResult, rows: AuthorEntry[], cols: Cols) {
  const { Workbook } = await import("exceljs");
  const head = [
    "Author",
    "Profile",
    "Account type",
    "Posts commented on",
    ...(cols.status ? ["Status", "Contact info"] : []),
    ...(cols.contacts ? ["Email", "Phone", "WhatsApp", "Telegram", "LinkedIn", "Contacts from post"] : []),
    ...(cols.comments ? ["Comment links", "Post links"] : []),
    ...(cols.about ? ["About"] : []),
  ];
  const lines = rows.map((a) => {
    const comments = a.comments ?? [];
    const posts = [...new Set((comments.length ? comments.map(postLink) : [a.post_url]).filter(Boolean))];
    return [
      a.name,
      a.profile,
      a.kind === "person" ? "Person" : "Company page",
      String(a.posts),
      ...(cols.status ? [STATUS_TEXT[a.status], CONTACT_INFO_TEXT[a.contact_info ?? ""] ?? ""] : []),
      ...(cols.contacts
        ? [
            ...CSV_TYPES.map((type) =>
              a.contacts
                .filter((t) => t.type === type)
                .map((t) => t.value)
                .join("; "),
            ),
            a.contact_post ?? "",
          ]
        : []),
      ...(cols.comments
        ? [comments.map(commentLink).filter(Boolean).join(", "), posts.join(", ")]
        : []),
      ...(cols.about ? [(a.about ?? "").replace(/\s*\n\s*/g, " ")] : []),
    ];
  });

  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Authors", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(head);
  lines.forEach((line) => sheet.addRow(line));
  head.forEach((title, i) => {
    const column = sheet.getColumn(i + 1);
    const longest = Math.max(title.length, ...lines.map((line) => line[i].length));
    column.width = Math.min(Math.max(longest + 2, 10), 100);
    column.alignment = { vertical: "top", wrapText: false };
  });
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `authors_${result.username}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

type View = { id: string; run: Run | null; result: AuthorsResult | null; loaded: boolean; gone: boolean };

type Props = {
  configured: boolean;
  initialLink: ApiLink;
  initialStatus: ScraperStatus | null;
  initialRuns: Run[] | null; // null: the history couldn't be loaded, the page asks again
};

export default function AuthorsPanel({ configured, initialLink, initialStatus, initialRuns }: Props) {
  // ?run=<id> from the address bar itself, so Back to a page whose URL was updated shows that lookup
  const params = useSearchParams();
  const [status, setStatus] = useState(initialStatus);
  const [link, setLink] = useState(initialLink);
  const [runs, setRuns] = useState(initialRuns ?? []);
  // the lookup on screen: the one in the address bar, else a running one, else the newest
  const [view, setView] = useState<View | null>(() => {
    const asked = params.get("run");
    const running = initialStatus?.current?.kind === "authors" ? initialStatus.current : null;
    const known = [running, ...(initialRuns ?? [])];
    const askedOk = asked && RUN_ID_RE.test(asked) && !known.some((r) => r?.id === asked && r.kind !== "authors");
    const id = askedOk ? asked : (running?.id ?? initialRuns?.find((r) => r.kind === "authors")?.id);
    if (!id) return null;
    return { id, run: known.find((r) => r?.id === id) ?? null, result: null, loaded: false, gone: false };
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"start" | "stop" | "continue" | null>(null);

  const busy = status?.busy ?? false;
  const busyRef = useRef(busy);
  const viewIdRef = useRef(view?.id);
  const followedRef = useRef(initialStatus?.current?.id);
  const seenRef = useRef(`${initialStatus?.current?.id}|${initialStatus?.last?.id}`);
  const runsLoadedRef = useRef(initialRuns !== null);
  const pollSoonRef = useRef(() => {});
  const resultsRef = useRef<HTMLElement>(null);

  const lookups = useMemo(() => runs.filter((r) => r.kind === "authors"), [runs]);

  // a link to another page was just clicked: its navigation hasn't changed the address yet
  const leavingRef = useRef(0);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const newTab = e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
      if (a instanceof HTMLAnchorElement && !newTab && a.target !== "_blank" && a.origin === window.location.origin) {
        if (a.pathname !== window.location.pathname) leavingRef.current = Date.now();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  function show(id: string, run: Run | null = null, updateUrl = true) {
    if (id === viewIdRef.current) return;
    viewIdRef.current = id;
    setView({ id, run, result: null, loaded: false, gone: false });
    const leaving = Date.now() - leavingRef.current < 5000;
    if (updateUrl && !leaving && window.location.pathname === "/comments/authors") {
      window.history.replaceState(null, "", authorsHref(id));
    }
  }

  // on a phone the results sit below the form, often off screen: bring them into view
  function reveal() {
    requestAnimationFrame(() => {
      const top = resultsRef.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 0 || top > window.innerHeight * 0.6)) {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  const revealRef = useRef<string | null>(null);
  function open(run: Run) {
    if (run.id === viewIdRef.current) {
      reveal();
      return;
    }
    revealRef.current = run.id;
    show(run.id, run);
  }
  const loadedId = view?.loaded ? view.id : null;
  useEffect(() => {
    if (!loadedId || revealRef.current !== loadedId) return;
    revealRef.current = null;
    reveal();
  }, [loadedId]);

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
          if (s.current && s.current.id !== followedRef.current) {
            followedRef.current = s.current.id;
            if (s.current.kind === "authors") show(s.current.id, s.current);
          }
          const seen = `${s.current?.id}|${s.last?.id}`;
          if (!runsLoadedRef.current || seen !== seenRef.current) {
            seenRef.current = seen;
            api<{ runs: Run[] }>("runs").then(
              (r) => {
                runsLoadedRef.current = true;
                setRuns(r.runs);
                const newest = r.runs.find((x) => x.kind === "authors");
                if (!viewIdRef.current && newest) show(newest.id, newest, false);
              },
              () => {
                runsLoadedRef.current = false; // try again at the next poll
              },
            );
          }
          busyRef.current = s.busy;
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
        soon = true;
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
  }, [configured]);

  // Follow the lookup on screen: its run and the authors found so far, until it has finished.
  const viewId = view?.id;
  useEffect(() => {
    if (!viewId || !configured) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let settling = 0;
    let sawRunning = false;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const data = await api<AuthorsResponse>(`authors/${viewId}`);
          if (cancelled) return;
          setView((v) =>
            v && v.id === viewId
              ? {
                  ...v,
                  run: v.run && v.run.status !== "running" && data.run.status === "running" ? v.run : data.run,
                  result: data.result ?? v.result,
                  loaded: true,
                }
              : v,
          );
          const run = data.run;
          const settled = run.status !== "stopped" || run.ended_at !== null || ++settling > 20;
          if (run.status === "running") sawRunning = true;
          else if (settled) {
            if (sawRunning) pollSoonRef.current();
            return;
          }
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            if (!cancelled) setView((v) => (v && v.id === viewId ? { ...v, loaded: true, gone: true } : v));
            return;
          }
          // API briefly unreachable: keep trying
        }
      }
      if (!cancelled) timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewId, configured]);

  // limit null: Unlimited, every comment
  async function start(profile: string, limit: number | null) {
    setPending("start");
    setMessage(null);
    try {
      const run = await post<Run>("authors", { profile, limit });
      busyRef.current = true;
      followedRef.current = run.id;
      setStatus((s) => ({ busy: true, current: run, last: s?.last ?? null }));
      open(run);
      pollSoonRef.current();
    } catch (e) {
      setMessage(errorText(e, limit === null));
    } finally {
      setPending(null);
    }
  }

  async function stop(id: string) {
    setPending("stop");
    try {
      const run = await post<Run>(`runs/${id}/stop`);
      setView((v) => (v && v.id === id ? { ...v, run } : v));
      setStatus((s) => (s ? { ...s, current: run } : s));
    } catch (e) {
      setMessage(e instanceof ApiError && e.status === 409 ? "This lookup has already finished." : errorText(e));
    } finally {
      setPending(null);
    }
  }

  // a lookup that stopped part-way goes on from where it stopped: a new run that starts with what it found
  async function goOn(id: string) {
    setPending("continue");
    setMessage(null);
    try {
      const run = await post<Run>(`authors/${id}/resume`);
      busyRef.current = true;
      followedRef.current = run.id;
      setStatus((s) => ({ busy: true, current: run, last: s?.last ?? null }));
      open(run);
      pollSoonRef.current();
    } catch (e) {
      setMessage(continueErrorText(e));
    } finally {
      setPending(null);
    }
  }

  const current = status?.current ?? null;
  const offline = configured && link !== "online";
  const blocked = busy || offline || pending !== null;
  const shown = view?.run ? withCount(view.run, view.result) : null;
  const fresh = [current, shown].filter((r): r is Run => r !== null);
  const elsewhere =
    current?.kind === "authors" && current.status === "running" && current.id !== view?.id ? current : null;

  const live = shown
    ? `${shown.username ?? "Lookup"}: ${
        shown.status === "running"
          ? `${STATUS.running.label}${shown.login_required ? ", LinkedIn login needed" : ""}`
          : authorsResult(shown, view?.result)
      }`
    : "";

  return (
    <div className="w-full">
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
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
            <h1 className="text-base font-semibold tracking-tight">User comments account data</h1>
            <p className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-400">
              Contacts of the authors of the posts an account commented on
            </p>
          </div>
          <PageTabs active="authors" />
          <ApiBadge configured={configured} link={link} busy={busy} />
        </div>
      </header>

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

      <div className="min-h-[calc(100dvh-3.75rem)] w-full bg-zinc-100/60 px-4 py-6 sm:px-6 sm:py-8 dark:bg-zinc-900/20">
        {!configured ? (
          <Notice title="The scraper API isn't set up">
            Add <Code>SCRAPER_API_URL</Code> and <Code>SCRAPER_API_TOKEN</Code> to <Code>linkedin-data/.env</Code> (the
            token is <Code>API_TOKEN</Code> from <Code>linkedin-2/.env</Code>), then restart this app.
          </Notice>
        ) : (
          <div className="space-y-6">
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

            {/* the form and the lookup's summary in one full-width card */}
            <div className={`${CARD} overflow-hidden shadow-sm`}>
              {view?.run?.status === "running" && (
                <div className="h-0.5 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                  <div className="h-full w-1/3 rounded-full bg-zinc-500 animate-slide-x dark:bg-zinc-400" />
                </div>
              )}
              {elsewhere && (
                <button
                  type="button"
                  onClick={() => open(elsewhere)}
                  className="flex w-full items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-left text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-inset dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950"
                >
                  <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
                  <span className="flex-1">A lookup for {elsewhere.username ?? "another account"} is running</span>
                  <span className="underline underline-offset-2">Show it</span>
                </button>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <LookupForm
                  blocked={blocked}
                  blockedReason={
                    link === "token"
                      ? "The scraper API rejects this app's token (see above)."
                      : offline
                        ? "The scraper API isn't reachable right now."
                        : !busy
                          ? null
                          : current?.kind !== "authors"
                            ? "Another job is running (a scraper run or a User comments lookup). Wait for it to finish, or stop it first."
                            : current.id === view?.id
                              ? "A lookup is running. Wait for it to finish, or press Stop."
                              : "Another lookup is running. Wait for it to finish, or open it and press Stop."
                  }
                  starting={pending === "start"}
                  onStart={start}
                />
                <Summary
                  view={view}
                  link={link}
                  current={current}
                  stopping={pending === "stop"}
                  onStop={stop}
                  blocked={blocked}
                  continuing={pending === "continue"}
                  onContinue={goOn}
                />
              </div>
            </div>

            {/* the authors as a table; the scraper output (the logs) sits at its bottom */}
            <section ref={resultsRef} aria-label="Authors" className="min-w-0 scroll-mt-32 sm:scroll-mt-20">
              <AuthorsTable view={view} lookups={lookups} fresh={fresh} onShow={open} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function LookupForm({
  blocked,
  blockedReason,
  starting,
  onStart,
}: {
  blocked: boolean;
  blockedReason: string | null;
  starting: boolean;
  onStart: (profile: string, limit: number | null) => void;
}) {
  const [profile, setProfile] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));

  const name = parseProfile(profile);
  const profileError = profile.trim() !== "" && !name;
  const limitN = /^\d+$/.test(limit.trim()) ? Number(limit) : NaN;
  const limitOk = unlimited || (limitN >= 1 && limitN <= MAX_COMMENTS);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name && limitOk && !blocked) onStart(name, unlimited ? null : limitN);
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-w-0 flex-col border-b border-zinc-200 lg:border-r lg:border-b-0 dark:border-zinc-800"
      aria-labelledby="authors-title"
    >
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-transparent px-4 py-4 sm:px-5 dark:border-zinc-800 dark:from-zinc-900/60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-600 text-white shadow-md shadow-zinc-900/20 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900">
          <Icon name="users" />
        </span>
        <div className="min-w-0">
          <h2 id="authors-title" className="text-base font-semibold tracking-tight">
            Find authors&apos; contacts
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            The posts this account commented on → their authors → the contacts in each author&apos;s About section
            and Contact info, or else in their posts.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
        <div>
          <label htmlFor="authors-profile" className="text-sm font-medium">
            LinkedIn username or profile URL
          </label>
          <input
            id="authors-profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="satyanadella or https://www.linkedin.com/in/satyanadella/"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={profileError}
            aria-describedby="authors-profile-hint"
            className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-hidden focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-900 dark:focus:ring-zinc-700 ${
              profileError ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          <p id="authors-profile-hint" className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {profileError ? (
              <span className="text-red-600 dark:text-red-400">
                Enter a username like satyanadella or a URL like linkedin.com/in/satyanadella.
              </span>
            ) : name ? (
              <>
                Profile:{" "}
                <a
                  href={profileUrl(name)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  linkedin.com/in/{name}
                </a>
              </>
            ) : (
              "Personal profiles only: company pages have no comments page."
            )}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            {unlimited ? (
              <span className="text-sm font-medium">Max comments</span>
            ) : (
              <label htmlFor="authors-limit" className="text-sm font-medium">
                Max comments
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Unlimited
              <Switch checked={unlimited} onChange={setUnlimited} label="Unlimited: every comment the account has" />
            </label>
          </div>
          {unlimited ? (
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Every comment the account has: the authors of all those posts.
            </p>
          ) : (
            <>
              <input
                id="authors-limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_COMMENTS}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-invalid={!limitOk}
                aria-describedby="authors-limit-hint"
                className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm tabular-nums outline-hidden focus:ring-2 focus:ring-zinc-300 sm:max-w-xs dark:bg-zinc-900 dark:focus:ring-zinc-700 ${
                  limitOk ? "border-zinc-200 dark:border-zinc-700" : "border-red-400 dark:border-red-700"
                }`}
              />
              <p id="authors-limit-hint" className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {limitOk ? (
                  "The newest comments: the authors of the posts they are on."
                ) : (
                  <span className="text-red-600 dark:text-red-400">1 to {MAX_COMMENTS}.</span>
                )}
              </p>
            </>
          )}
        </div>


        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {blockedReason && <p className="text-xs text-zinc-500 sm:mr-auto dark:text-zinc-400">{blockedReason}</p>}
          <button
            type="submit"
            disabled={blocked || !name || !limitOk}
            className={`${PRIMARY} shadow-md shadow-zinc-900/15 sm:min-w-44`}
          >
            <Icon name="search" />
            {starting ? "Starting..." : "Find authors' contacts"}
          </button>
        </div>
      </div>
    </form>
  );
}

const TILE = "rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60";

// The lookup's header: who it is about, its stat tiles and its outcome. The right half of the top card.
function Summary({
  view,
  link,
  current,
  stopping,
  onStop,
  blocked,
  continuing,
  onContinue,
}: {
  view: View | null;
  link: ApiLink;
  current: Run | null;
  stopping: boolean;
  onStop: (id: string) => void;
  blocked: boolean;
  continuing: boolean;
  onContinue: (id: string) => void;
}) {
  const run = view?.run ?? null;
  const running = run?.status === "running";
  const now = useNow(running);
  const result = view?.result ?? null;

  if (!view) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <Icon name="users" className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold">
          {link === "online" ? "No lookups yet" : link === "token" ? "Lookups can't be loaded" : "Waiting for the scraper API"}
        </p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {link === "online"
            ? "Enter a username or profile URL and press Find authors' contacts. The authors show up here with the contacts in their About sections."
            : link === "token"
              ? "They show up here once the API token matches."
              : "Earlier lookups show up here once the API is reachable."}
        </p>
      </div>
    );
  }

  const lookup = run?.kind === "authors" ? run : null;
  const counted = lookup ? withCount(lookup, result) : null;
  const username = lookup?.username ?? result?.username ?? "";
  const name = result?.name ?? null;
  const profile = safeUrl(lookup?.profile ?? result?.profile ?? null);
  const elapsed = lookup ? (running ? now / 1000 : (lookup.ended_at ?? lookup.started_at)) - lookup.started_at : null;
  const isCurrent = current?.id === view.id;
  const toRead = result?.profiles_total ?? null;

  return (
    <div className="min-w-0 space-y-4 bg-gradient-to-b from-zinc-50/90 to-transparent p-4 sm:p-5 dark:from-zinc-900/50">
        <div className="flex items-start justify-between gap-3">
          <div
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-900 to-zinc-600 text-base font-semibold text-white uppercase shadow-md shadow-zinc-900/20 ring-2 ring-white dark:from-zinc-100 dark:to-zinc-400 dark:text-zinc-900 dark:ring-zinc-800"
          >
            {(name ?? username).trim().charAt(0) || <Icon name="users" className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className={EYEBROW}>{running ? "Collecting now" : "Authors of posts commented on by"}</div>
            <h2 className="mt-0.5 truncate text-base font-semibold">
              {name ?? (username || (view.gone ? "Lookup not found" : "Loading..."))}
            </h2>
            {profile && (
              <a
                href={profile}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 truncate text-xs text-zinc-500 hover:underline dark:text-zinc-400"
              >
                linkedin.com/in/{username}
                <Icon name="external" className="h-3 w-3 shrink-0" />
              </a>
            )}
          </div>
          {lookup && <StatusPill status={lookup.status} />}
        </div>

        {lookup && counted && (
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
            <div className={TILE}>
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="users" className="h-3 w-3" />
                Contacts
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{counted.contacts_found ?? 0}</dd>
            </div>
            <div className={TILE}>
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="flag" className="h-3 w-3" />
                Authors
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{counted.authors_found ?? 0}</dd>
            </div>
            <div className={TILE}>
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="check" className="h-3 w-3" />
                Profiles read
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {counted.profiles_read ?? 0}
                {toRead !== null && (
                  <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400"> of {toRead}</span>
                )}
              </dd>
            </div>
            <div className={TILE}>
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="message" className="h-3 w-3" />
                Comments read
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{counted.comments_found ?? 0}</dd>
            </div>
            <div className={TILE}>
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="clock" className="h-3 w-3" />
                Elapsed
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums" suppressHydrationWarning>
                {elapsed === null || (!running && lookup.ended_at === null) ? "–" : duration(elapsed)}
              </dd>
            </div>
            <div className={TILE}>
              <dt className="text-zinc-500 dark:text-zinc-400">Started</dt>
              <dd className="mt-2 text-sm font-semibold tabular-nums">
                <LocalTime epoch={lookup.started_at} />
              </dd>
            </div>
          </dl>
        )}

        {lookup && counted && (
          <p className="rounded-lg border-l-2 border-zinc-300 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-200">
            {authorsResult(counted, result)}
          </p>
        )}
        {view.gone && (
          <p className="text-sm text-zinc-700 dark:text-zinc-200">This lookup is no longer on the scraper API.</p>
        )}

        {lookup?.login_required && running && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <Icon name="alert" className="h-3.5 w-3.5" />
              LinkedIn login needed
            </div>
            On your PC: log in to LinkedIn in the Chrome window that opened, and the lookup continues by itself. On a
            server: stop it and upload a session file in{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              Settings
            </Link>
            .
          </div>
        )}

        {lookup && isCurrent && running && (
          <button
            type="button"
            onClick={() => onStop(view.id)}
            disabled={stopping || lookup.status !== "running" || current?.status === "stopped"}
            className={`${BUTTON} w-full border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40`}
          >
            <Icon name="stop" />
            {stopping ? "Stopping..." : "Stop"}
          </button>
        )}

        {lookup && continuable(lookup, result?.complete) && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onContinue(view.id)}
              disabled={blocked}
              className={`${PRIMARY} w-full`}
            >
              <Icon name="play" />
              {continuing ? "Continuing..." : "Continue from here"}
            </button>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              A new run keeps the comments read and the authors opened so far, and goes on from where this lookup
              stopped, not from the beginning.
            </p>
          </div>
        )}
    </div>
  );
}

// the sticky header cell of the authors table
const TH =
  "sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-left font-medium whitespace-nowrap sm:px-5 dark:border-zinc-800 dark:bg-zinc-900";

// The authors as a compact table in a fixed frame: the rows scroll inside it, not the page. The toolbar holds
// the earlier-lookups picker, the search and the CSV download; the scraper output (the logs) closes the card.
function AuthorsTable({
  view,
  lookups,
  fresh,
  onShow,
}: {
  view: View | null;
  lookups: Run[];
  fresh: Run[];
  onShow: (run: Run) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState({ key: "", n: PAGE });
  const cols = useSyncExternalStore(subscribeCols, getCols, getServerCols);
  const [colsOpen, setColsOpen] = useState(false);
  const run = view?.run ?? null;
  const lookup = run?.kind === "authors" ? run : null;
  const running = run?.status === "running";
  const result = view?.result ?? null;
  const username = lookup?.username ?? result?.username ?? "";
  const customized = COLUMN_OPTIONS.some((c) => !cols[c.key]);
  // the frame scrolls sideways below the room the chosen columns need
  const tableMinWidth = `${15 + (cols.status ? 8 : 0) + (cols.contacts ? 22 : 0) + (cols.comments ? 16 : 0) + (cols.about ? 18 : 0)}rem`;

  const authors = useMemo(() => result?.authors ?? [], [result]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return authors;
    return authors.filter((a) =>
      [a.name, a.profile, a.about, ...a.contacts.map((t) => t.value)].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [authors, query]);
  const withContacts = authors.filter((a) => a.contacts.length).length;
  const pageKey = `${view?.id}|${query}`;
  const shownN = page.key === pageKey ? page.n : PAGE;

  // the picker's rows: the earlier lookups (with live counts), plus the one on screen if it isn't listed yet
  const options = useMemo(() => {
    const merged = lookups.map((listed) => fresh.find((f) => f.id === listed.id) ?? listed);
    const shown = view?.run;
    if (shown && shown.kind === "authors" && !merged.some((r) => r.id === shown.id)) merged.unshift(shown);
    return merged;
  }, [lookups, fresh, view]);

  return (
    <div className={`${CARD} overflow-hidden shadow-sm`}>
      <div className="flex flex-col gap-2 border-b border-zinc-200 bg-zinc-50/60 px-4 py-3 sm:px-5 lg:flex-row lg:items-center dark:border-zinc-800 dark:bg-zinc-900/30">
        {options.length > 0 && (
          <Select
            value={view?.id ?? ""}
            onValueChange={(id) => {
              const picked = options.find((r) => r.id === id);
              if (picked) onShow(picked);
            }}
          >
            <SelectTrigger aria-label="Earlier lookups" title="Earlier lookups" className="w-full shrink-0 lg:w-80">
              <SelectValue placeholder="Earlier lookups" />
            </SelectTrigger>
            <SelectContent>
              {options.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="font-medium">{r.username ?? r.title}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" "}
                    · <LocalTime epoch={r.started_at} /> · {r.contacts_found ?? 0} contacts ·{" "}
                    {r.status === "running" ? STATUS.running.label : STATUS[r.status].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search these authors</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search authors, contacts and About text"
            className="block w-full rounded-lg border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm outline-hidden focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-700"
          />
        </label>
        <button
          type="button"
          onClick={() => setColsOpen((o) => !o)}
          aria-expanded={colsOpen}
          aria-controls="authors-columns"
          className={SECONDARY}
        >
          <Icon name="sliders" />
          Columns
          {customized && (
            <>
              {/* a div, not a span: span.rounded-full is reserved for badges/status pills (the tests rely on it) */}
              <div className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
              <span className="sr-only">(changed from the default)</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => result && downloadXlsx(result, filtered, cols)}
          disabled={!result || filtered.length === 0}
          title="Download as Excel (.xlsx)"
          className={SECONDARY}
        >
          <Icon name="download" />
          {query.trim() ? `Excel (${filtered.length})` : "Excel"}
        </button>
      </div>

      {colsOpen && (
        <div
          id="authors-columns"
          className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2.5 sm:px-5 dark:border-zinc-800"
        >
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Show columns:</span>
          {COLUMN_OPTIONS.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-zinc-400 has-checked:border-zinc-900 has-checked:bg-zinc-50 has-focus-visible:ring-2 has-focus-visible:ring-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500 dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900"
            >
              <input
                type="checkbox"
                checked={cols[col.key]}
                onChange={(e) => saveCols({ ...getCols(), [col.key]: e.target.checked })}
                className="h-3.5 w-3.5 accent-zinc-900 outline-hidden dark:accent-zinc-100"
              />
              {col.label}
            </label>
          ))}
          <span className="ml-auto flex items-center gap-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Saved in this browser · the CSV gets these columns too
            </span>
            <button
              type="button"
              onClick={() => saveCols(DEFAULT_COLS)}
              disabled={!customized}
              className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-all hover:border-zinc-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-500"
            >
              <Icon name="reset" className="h-3.5 w-3.5" />
              Reset
            </button>
          </span>
        </div>
      )}

      {!view ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          The authors show up here as a table once a lookup runs.
        </p>
      ) : !view.loaded ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">Loading...</p>
      ) : view.gone ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          This lookup is no longer on the scraper API.
        </p>
      ) : authors.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          {running ? "Reading the comments... the authors show up here as they are found." : "No authors in this lookup."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          No authors match this search.
        </p>
      ) : (
        <>
          <p className="border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500 sm:px-5 dark:border-zinc-800 dark:text-zinc-400">
            {query.trim()
              ? `${filtered.length} of ${authors.length} authors match.`
              : `${authors.length} ${authors.length === 1 ? "author" : "authors"}, ${withContacts} with contacts.`}
          </p>
          {/* the fixed frame: the table scrolls in here, sideways too when it needs more room */}
          <div className="max-h-[62dvh] overflow-auto overscroll-contain">
            <table className="w-full table-fixed text-sm" style={{ minWidth: tableMinWidth }}>
              <thead className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                <tr>
                  <th className={`${TH} ${cols.contacts ? "w-60" : ""}`}>Author</th>
                  {cols.status && <th className={`${TH} w-32`}>Status</th>}
                  {cols.contacts && <th className={TH}>Contacts</th>}
                  {cols.comments && (
                    <th className={`${TH} w-64`}>{username ? `Comments by ${username}` : "Comments"}</th>
                  )}
                  {cols.about && <th className={`${TH} ${cols.contacts ? "w-72" : ""}`}>About</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.slice(0, shownN).map((a) => (
                  <AuthorRow key={a.profile} author={a} cols={cols} />
                ))}
              </tbody>
            </table>
            {filtered.length > shownN && (
              <button
                type="button"
                onClick={() => setPage({ key: pageKey, n: shownN + PAGE })}
                className="w-full border-t border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
              >
                Show {Math.min(PAGE, filtered.length - shownN)} more ({filtered.length - shownN} left)
              </button>
            )}
          </div>
        </>
      )}

      {lookup && <OutputLog key={lookup.id} runId={lookup.id} running={running ?? false} />}
    </div>
  );
}

const AUTHOR_STATUS: Record<AuthorEntry["status"], string> = {
  waiting: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  read: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  not_found: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  company: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

const ACTION_IDLE =
  "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const ACTION_DONE =
  "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400";

const SOURCE: Record<string, string> = { about: "About", contact_info: "Contact info", post: "their post" };

function shortDate(iso: string | null) {
  const when = iso ? new Date(iso) : null;
  return when && !Number.isNaN(when.getTime())
    ? when.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
    : null;
}

// An author with no contact details: where they were looked for (the About section, Contact info when it was shown,
// and the posts of theirs that were read)
function noContactsText(a: AuthorEntry) {
  const read = a.own_posts_read ?? 0;
  const places = [
    "the About section",
    ...(a.contact_info === "read" ? ["Contact info"] : []),
    ...(read ? [`${read} of their posts`] : []),
  ];
  const last = places.pop();
  return `No contact details in ${places.length ? `${places.join(", ")} or ${last}` : last}.`;
}

// One author per row. Every cell keeps the data clickable the way the cards had it: the profile, each
// contact's Open and Copy, and the links to the comments and posts. `cols`: the columns to render.
function AuthorRow({ author: a, cols }: { author: AuthorEntry; cols: Cols }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [allComments, setAllComments] = useState(false);
  const profile = safeUrl(a.profile);
  const initial = (a.name || a.profile.replace(/\/+$/, "").split("/").pop() || "?").trim().charAt(0);
  // the account's comments on this author's posts; a file from before them has only the newest post's link
  const comments: (UserComment | AuthorLink)[] = a.comments?.length
    ? a.comments
    : a.post_url
      ? [{ id: "post", post_url: a.post_url, comment_url: null, date: null }]
      : [];
  const shownComments = allComments ? comments : comments.slice(0, 2);
  const fromAbout = a.contacts.filter((t) => !t.found_in || t.found_in.includes("about")).length;
  const fromInfo = a.contacts.filter((t) => t.found_in?.includes("contact_info")).length;
  const fromPost = a.contacts.filter((t) => t.found_in?.includes("post")).length;
  const contactPost = safeUrl(a.contact_post ?? null);
  const notes = [
    a.status === "read" && !a.about ? "No About section." : null,
    a.contact_info === "none" ? "Contact info wasn't shown." : a.contact_info === "failed" ? "Contact info didn't load." : null,
    a.status === "read" && a.contacts.length === 0 ? noContactsText(a) : null,
    a.posts_note || (a.own_posts_found && !a.own_posts_read)
      ? "Their posts didn't load."
      : a.own_posts_found === 0
        ? "No posts of theirs were found."
        : null,
  ].filter(Boolean);

  return (
    <tr className="align-top transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30">
      <td className="px-4 py-2.5 sm:px-5">
        <div className="flex items-start gap-2.5">
          <div
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-300"
          >
            {initial}
          </div>
          <div className="min-w-0">
            {profile ? (
              <a
                href={profile}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-semibold hover:underline"
                title={a.name || profile}
              >
                {a.name || profile.replace(/^https:\/\/www\./, "")}
              </a>
            ) : (
              <span className="block truncate text-sm font-semibold">{a.name || "Unknown author"}</span>
            )}
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {a.posts === 1 ? "1 post commented on" : `${a.posts} posts commented on`}
            </div>
            {a.status === "failed" && a.note && (
              <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400" title={a.note}>
                {a.note}
              </div>
            )}
          </div>
        </div>
      </td>
      {cols.status && (
        <td className="px-4 py-2.5 sm:px-5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${AUTHOR_STATUS[a.status]}`}>
            {STATUS_TEXT[a.status]}
          </span>
          {a.contact_info && CONTACT_INFO_TEXT[a.contact_info] && (
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Contact info: {CONTACT_INFO_TEXT[a.contact_info]}
            </div>
          )}
        </td>
      )}
      {cols.contacts && (
        <td className="px-4 py-2.5 sm:px-5">
          {a.contacts.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {a.contacts.map((t) => (
                <ContactChip key={`${t.type}:${t.value}`} type={t.type} value={t.value} foundIn={t.found_in} />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Found in{" "}
              {[
                fromAbout ? `About (${fromAbout})` : null,
                fromInfo ? `Contact info (${fromInfo})` : null,
                fromPost ? `their post (${fromPost})` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {fromPost > 0 && contactPost && (
                <>
                  {" · "}
                  <a
                    href={contactPost}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                  >
                    Open that post
                    <Icon name="external" className="h-3 w-3" />
                  </a>
                </>
              )}
            </p>
          </>
        ) : (
          <span className="text-xs text-zinc-400 dark:text-zinc-600">No contacts.</span>
        )}
          {notes.length > 0 && <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{notes.join(" ")}</p>}
        </td>
      )}
      {cols.comments && (
        <td className="px-4 py-2.5 sm:px-5">
          {comments.length > 0 ? (
          <>
            <ul>
              {shownComments.map((c) => (
                <CommentLine key={c.id} link={asLink(c)} />
              ))}
            </ul>
            {comments.length > 2 && (
              <button
                type="button"
                onClick={() => setAllComments((x) => !x)}
                aria-expanded={allComments}
                className="mt-0.5 text-xs font-medium text-zinc-600 hover:underline dark:text-zinc-300"
              >
                {allComments ? "Show fewer" : `Show all ${comments.length}`}
              </button>
            )}
          </>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
          )}
        </td>
      )}
      {cols.about && (
        <td className="px-4 py-2.5 sm:px-5">
          {a.about ? (
          <>
            <p
              className={`text-xs leading-relaxed break-words whitespace-pre-wrap text-zinc-600 dark:text-zinc-400 ${
                aboutOpen ? "" : "line-clamp-3"
              }`}
            >
              {a.about}
            </p>
            {a.about.length > 140 && (
              <button
                type="button"
                onClick={() => setAboutOpen((o) => !o)}
                aria-expanded={aboutOpen}
                className="mt-0.5 text-xs font-medium text-zinc-600 hover:underline dark:text-zinc-300"
              >
                {aboutOpen ? "Show less" : "Show the whole About"}
              </button>
            )}
          </>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
          )}
        </td>
      )}
    </tr>
  );
}

// one of the account's comments: when, and the links to the comment and its post
function CommentLine({ link: c }: { link: AuthorLink }) {
  const postUrl = safeUrl(c.post_url);
  const commentUrl = safeUrl(c.comment_url);
  const day = shortDate(c.date);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="w-24 shrink-0 font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{day ?? "—"}</span>
      {commentUrl && (
        <a href={commentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
          Comment
          <Icon name="external" className="h-3 w-3" />
        </a>
      )}
      {postUrl && (
        <a href={postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
          Post
          <Icon name="external" className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

const CHIP_BTN =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all duration-150 active:scale-90";

// one contact in an author's box: its type, the value, and Open / Copy
function ContactChip({ type, value, foundIn }: { type: string; value: string; foundIn?: string[] }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. plain http on another device): the value is still selectable
    }
  }

  const href = hrefFor({ type, value });
  const where = (foundIn?.length ? foundIn : ["about"]).map((w) => SOURCE[w] ?? w).join(" and ");
  return (
    <div
      title={`Found in ${where}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 py-1 pr-1 pl-1.5 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_BADGE[type] ?? "bg-zinc-100 dark:bg-zinc-800"}`}>
        {TYPE_LABEL[type] ?? type}
      </span>
      <span className="min-w-0 font-mono text-xs break-all">{value}</span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="Open"
          aria-label={`Open ${value}`}
          className={`${CHIP_BTN} ${ACTION_IDLE}`}
        >
          <Icon name="external" className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copied!" : "Copy"}
        aria-label={`Copy ${value}`}
        className={`${CHIP_BTN} ${copied ? ACTION_DONE : ACTION_IDLE}`}
      >
        <Icon name={copied ? "check" : "copy"} className={copied ? "animate-pop h-3.5 w-3.5" : "h-3.5 w-3.5"} />
      </button>
    </div>
  );
}

