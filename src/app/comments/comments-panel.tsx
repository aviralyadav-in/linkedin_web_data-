"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { hrefFor } from "@/lib/contact-links";
import type {
  CommentContact,
  CommentsResponse,
  CommentsResult,
  Run,
  RunLog,
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
} from "../commands/commands-panel";
import PageTabs from "../page-tabs";
import { commentsHref, commentsResult } from "./comments-result";

// linkedin_comments.py / api.py limits and defaults
const MAX_COMMENTS = 5000;
const DEFAULT_LIMIT = 200;
const PASSES = 5; // the API's default: linkedin_comments.py reads the list this many times
const PAGE = 50; // comments rendered at a time
const LOOKUP_ROWS = 6;
const RUN_ID_RE = /^[\w-]{1,64}$/;

// The same rules as linkedin_comments.py's parse_profile: a username, or a linkedin.com/in/<username> URL.
// Letters of any script with their vowel signs and other marks (\p{M}), digits, - and _.
const PROFILE_URL_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)\/?(?:[/?#]\S*)?$/i;
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{2,99}$/u;

function parseProfile(text: string) {
  const t = text.trim();
  const m = PROFILE_URL_RE.exec(t);
  let name = m ? m[1] : t.replace(/^@/, "").replace(/\/+$/, "");
  if (m) {
    try {
      name = decodeURIComponent(name);
    } catch {
      return null;
    }
  }
  return USERNAME_RE.test(name) ? name : null;
}

const profileUrl = (name: string) => `https://www.linkedin.com/in/${encodeURIComponent(name)}/`;

// only plain https links are rendered as links (the data comes from scraped pages)
const safeUrl = (url: string | null | undefined) => (url && /^https:\/\//i.test(url) ? url : null);

// the counts in the result file are the real ones; the run's own counts can lag behind them
const withCount = (run: Run, result: CommentsResult | null): Run =>
  result
    ? {
        ...run,
        comments_found: result.comments_read ?? result.comments.length,
        ...(result.contacts && { contacts_found: result.contacts.length }),
      }
    : run;

// Only contacts: a lookup from the result file's mode, or from the run while the file isn't loaded yet
const contactsOnly = (run: Run | null, result: CommentsResult | null) =>
  result ? result.mode === "contacts" : !!run?.contacts_only;

const RESTART_API = "Restart the scraper API (python api.py) so it runs the latest api.py";

function errorText(e: unknown, unlimited = false) {
  const status = e instanceof ApiError ? e.status : 0;
  if (status === 409) return "Another command is already running. Wait for it to finish, or stop it first.";
  // the form checks the profile the same way the API does: an older API refuses "no limit"
  if (status === 422 && unlimited) return `The scraper API didn't accept Unlimited. ${RESTART_API}, then try again.`;
  if (status === 422) {
    return "Enter a LinkedIn username (like satyanadella) or a profile URL (linkedin.com/in/...), and up to 5000 comments.";
  }
  if (status === 404) return "The scraper API doesn't know User comments yet. Restart it so it runs the latest api.py.";
  if (status === 401) return "The API token doesn't match: SCRAPER_API_TOKEN must equal API_TOKEN in linkedin-2/.env.";
  if (status === 403) return "The request was blocked. Reload the page and try again.";
  if (status === 500) return "The scraper API couldn't start the lookup. Check the API's own output for details.";
  if (status === 0 || status === 502 || status === 503) return "Can't reach the scraper API. Is it running?";
  return `Something went wrong (HTTP ${status}).`;
}

function commentDate(c: UserComment) {
  const when = c.date ? new Date(c.date) : null;
  const day =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
      : null;
  return [day, c.time].filter(Boolean).join(" · ") || "Date unknown";
}

// Excel would run a cell starting with = + - @ as a formula; a leading ' keeps it text. (The dashboard's ="..."
// wrapper can't be used here: Excel cuts formula text at 255 characters.)
function csvCell(value: string | null | undefined) {
  const v = value ?? "";
  return `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
}

// A contact value is short, so it gets the dashboard's ="..." wrapper: it also stops Excel from turning a phone
// number into 9.18E+11.
function valueCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /^[=+\-@\t\r\d]/.test(value) ? `="${escaped}"` : `"${escaped}"`;
}

function saveCsv(head: string[], lines: string[], filename: string) {
  // BOM so Excel reads the file as UTF-8; CRLF is what Excel expects
  const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(result: CommentsResult, rows: UserComment[]) {
  const head = ["Date", "Comment", "Reply to", "Post author", "Post", "Comment link", "Post link"];
  const lines = rows.map((c) =>
    [
      c.date ?? c.time,
      c.text,
      c.reply_to ? `${c.reply_to.author}: ${c.reply_to.text}` : "",
      c.post.author,
      c.post.text,
      c.url,
      c.post.url,
    ]
      .map(csvCell)
      .join(","),
  );
  saveCsv(head, lines, `comments_${result.username}.csv`);
}

function downloadContactsCsv(result: CommentsResult, rows: CommentContact[], byId: Map<string, UserComment>) {
  const head = ["Type", "Value", "Comments with it", "Newest comment date", "Comment", "Post author", "Comment link"];
  const lines = rows.map((t) => {
    const c = byId.get(t.comment_id);
    return [
      csvCell(TYPE_LABEL[t.type] ?? t.type),
      valueCell(t.value),
      ...[String(t.count), c ? (c.date ?? c.time) : "", c?.text, c?.post.author, c?.url].map(csvCell),
    ].join(",");
  });
  saveCsv(head, lines, `contacts_${result.username}.csv`);
}

// About 10 comments load per scroll, each taking ~3.5 s, for every pass; plus opening LinkedIn.
function roughTime(limit: number, passes: number) {
  const minutes = Math.max(1, Math.round((20 + passes * Math.ceil(limit / 10) * 3.5) / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

type View = { id: string; run: Run | null; result: CommentsResult | null; loaded: boolean; gone: boolean };

type Props = {
  configured: boolean;
  initialLink: ApiLink;
  initialStatus: ScraperStatus | null;
  initialRuns: Run[] | null; // null: the history couldn't be loaded, the page asks again
};

export default function CommentsPanel({ configured, initialLink, initialStatus, initialRuns }: Props) {
  // ?run=<id> from the address bar itself, so Back to a page whose URL was updated shows that lookup
  const params = useSearchParams();
  const [status, setStatus] = useState(initialStatus);
  const [link, setLink] = useState(initialLink);
  const [runs, setRuns] = useState(initialRuns ?? []);
  // the lookup on screen: the one in the address bar, else a running one, else the newest
  const [view, setView] = useState<View | null>(() => {
    const asked = params.get("run");
    const running = initialStatus?.current?.kind === "comments" ? initialStatus.current : null;
    const known = [running, ...(initialRuns ?? [])];
    // a ?run= of another kind of job (a scrape) is no lookup; an unknown one may be a lookup since pruned
    const askedOk = asked && RUN_ID_RE.test(asked) && !known.some((r) => r?.id === asked && r.kind !== "comments");
    const id = askedOk ? asked : (running?.id ?? initialRuns?.find((r) => r.kind === "comments")?.id);
    if (!id) return null;
    return { id, run: known.find((r) => r?.id === id) ?? null, result: null, loaded: false, gone: false };
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"start" | "stop" | null>(null);

  const busy = status?.busy ?? false;
  const busyRef = useRef(busy);
  const viewIdRef = useRef(view?.id);
  // the newest job this tab has seen start; a User comments job started elsewhere is shown when it starts
  const followedRef = useRef(initialStatus?.current?.id);
  const seenRef = useRef(`${initialStatus?.current?.id}|${initialStatus?.last?.id}`);
  const runsLoadedRef = useRef(initialRuns !== null);
  const pollSoonRef = useRef(() => {});
  const resultsRef = useRef<HTMLElement>(null);
  const openedFromLinkRef = useRef(view !== null && params.get("run") === view.id);

  const lookups = useMemo(() => runs.filter((r) => r.kind === "comments"), [runs]);

  // When a link to another page was just clicked, its navigation hasn't changed the address yet; updating this
  // page's URL then would undo it.
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
    // only while this page is on screen: a lookup started just before leaving must not rewrite another page's URL
    const leaving = Date.now() - leavingRef.current < 5000;
    if (updateUrl && !leaving && window.location.pathname === "/comments") {
      window.history.replaceState(null, "", commentsHref(id));
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

  // The results are brought into view once they have loaded: scrolling at once is undone when the card grows
  // (the browser keeps the list below it in place).
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

  // opened through a link to one lookup (e.g. from the Commands page): show it, not the form
  useEffect(() => {
    if (!openedFromLinkRef.current) return;
    const top = resultsRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top > window.innerHeight * 0.6) resultsRef.current?.scrollIntoView({ block: "start" });
  }, []);

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
            if (s.current.kind === "comments") show(s.current.id, s.current);
          }
          // history: when a job starts or ends, and once after the page was opened while the API was down
          const seen = `${s.current?.id}|${s.last?.id}`;
          if (!runsLoadedRef.current || seen !== seenRef.current) {
            seenRef.current = seen;
            api<{ runs: Run[] }>("runs").then(
              (r) => {
                runsLoadedRef.current = true;
                setRuns(r.runs);
                // nothing on screen yet (the page was opened while the API was down): show the newest lookup
                const newest = r.runs.find((x) => x.kind === "comments");
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

  // Follow the lookup on screen: its run and the comments found so far, until it has finished.
  const viewId = view?.id;
  useEffect(() => {
    if (!viewId || !configured) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let settling = 0;
    let sawRunning = false;
    let interval = 2000;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const data = await api<CommentsResponse>(`comments/${viewId}`);
          if (cancelled) return;
          // A result file caught mid-update reads as null: keep the comments already on screen. An answer sent
          // just before Stop can arrive after it: a run that has ended never runs again.
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
          // a big result is a big download: fetch it less often
          interval = (data.result?.comments.length ?? 0) > 1000 ? 5000 : 2000;
          const run = data.run;
          // a stopped run is "stopped" before its process has exited; its last comments come a moment later
          const settled = run.status !== "stopped" || run.ended_at !== null || ++settling > 20;
          if (run.status === "running") sawRunning = true;
          else if (settled) {
            if (sawRunning) pollSoonRef.current(); // update the busy state now, not at the next idle poll
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
      if (!cancelled) timer = setTimeout(tick, interval);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewId, configured]);

  // limit null: Unlimited, every comment; contacts: only the contact details in them
  async function start(profile: string, limit: number | null, contacts: boolean) {
    setPending("start");
    setMessage(null);
    try {
      const run = await post<Run>("comments", { profile, limit, contacts });
      busyRef.current = true;
      followedRef.current = run.id;
      setStatus((s) => ({ busy: true, current: run, last: s?.last ?? null }));
      open(run);
      pollSoonRef.current(); // switch the status poll to its fast, running pace
      // an older API ignores "contacts" and collects every comment
      if (contacts && !run.contacts_only) {
        setMessage(`The scraper API is an older version, so this lookup collects all comments. ${RESTART_API} to get only contacts.`);
      }
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

  const current = status?.current ?? null;
  const offline = configured && link !== "online";
  const blocked = busy || offline || pending !== null;
  const shown = view?.run ? withCount(view.run, view.result) : null;
  // the newest copies of the runs in the list: the running job and the lookup on screen
  const fresh = [current, shown].filter((r): r is Run => r !== null);

  // Screen readers hear status changes (and a login request), not the count going up on every scroll. The region
  // is always there, so the first lookup's start is announced too.
  const live = shown
    ? `${shown.username ?? "Lookup"}: ${
        shown.status === "running"
          ? `${STATUS.running.label}${shown.login_required ? ", LinkedIn login needed" : ""}`
          : commentsResult(shown, view?.result?.reached_end)
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
            <h1 className="text-base font-semibold tracking-tight">User comments</h1>
            <p className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-400">
              Every comment a LinkedIn account has written
            </p>
          </div>
          <PageTabs active="comments" />
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
          // On a phone: form, results, earlier lookups. On a wide screen the results take the right side; the
          // auto/1fr rows keep the lookups right under the form however long the results get.
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr]">
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
              <LookupForm
                blocked={blocked}
                blockedReason={
                  link === "token"
                    ? "The scraper API rejects this app's token (see above)."
                    : offline
                      ? "The scraper API isn't reachable right now."
                      : !busy
                        ? null
                        : current?.kind !== "comments"
                          ? "A scraper run is in progress. Wait for it to finish, or stop it on the Commands page."
                          : current.id === view?.id
                            ? "A lookup is running. Wait for it to finish, or press Stop."
                            : "Another lookup is running. Wait for it to finish, or open it and press Stop."
                }
                starting={pending === "start"}
                onStart={start}
              />
            </div>

            {/* scroll-mt clears the sticky header, which is two rows (title, tabs) on a phone */}
            <section
              ref={resultsRef}
              aria-label="Comments"
              className="min-w-0 scroll-mt-32 sm:scroll-mt-20 lg:col-start-2 lg:row-span-2 lg:row-start-1"
            >
              <Results
                view={view}
                link={link}
                current={current}
                stopping={pending === "stop"}
                onStop={stop}
                onShow={open}
              />
            </section>

            <div className="min-w-0">
              <Lookups runs={lookups} fresh={fresh} viewId={view?.id} onShow={open} />
            </div>
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
  onStart: (profile: string, limit: number | null, contacts: boolean) => void;
}) {
  const [profile, setProfile] = useState("");
  const [mode, setMode] = useState<"all" | "contacts">("all");
  const [unlimited, setUnlimited] = useState(false);
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));

  const name = parseProfile(profile);
  const profileError = profile.trim() !== "" && !name;
  const limitN = /^\d+$/.test(limit.trim()) ? Number(limit) : NaN;
  const limitOk = unlimited || (limitN >= 1 && limitN <= MAX_COMMENTS);
  const contacts = mode === "contacts";

  function submit(e: FormEvent) {
    e.preventDefault();
    // the username, not the pasted text: a long URL full of tracking parameters is still the same profile
    if (name && limitOk && !blocked) onStart(name, unlimited ? null : limitN, contacts);
  }

  return (
    <form onSubmit={submit} className={CARD} aria-labelledby="lookup-title">
      <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
          <Icon name="message" />
        </span>
        <div className="min-w-0">
          <h2 id="lookup-title" className="text-sm font-semibold">
            Find comments
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Reads the account&apos;s Activity → Comments page on LinkedIn: each comment, when it was written and the
            post it is on. Nothing is saved to the contacts database. Like any profile visit, the account may see it
            under &quot;Who viewed your profile&quot;.
          </p>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <label htmlFor="profile" className="text-sm font-medium">
            LinkedIn username or profile URL
          </label>
          <input
            id="profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="satyanadella or https://www.linkedin.com/in/satyanadella/"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={profileError}
            aria-describedby="profile-hint"
            className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-hidden focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-900 dark:focus:ring-zinc-700 ${
              profileError ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          <p id="profile-hint" className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
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

        <fieldset>
          <legend className="text-sm font-medium">Get</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "all", title: "All comments", text: "Every comment, with the post it is on." },
                {
                  value: "contacts",
                  title: "Only contacts",
                  text: "Just the email, phone number, WhatsApp and Telegram details in the comments.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-zinc-400 ${
                  mode === option.value
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                    : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-900 outline-hidden dark:accent-zinc-100"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {option.text}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sm:max-w-xs">
          <div className="flex items-center justify-between gap-3">
            {unlimited ? (
              <span className="text-sm font-medium">Max comments</span>
            ) : (
              <label htmlFor="limit" className="text-sm font-medium">
                Max comments
              </label>
            )}
            {/* clicking the word works too: a label passes the click on to the switch inside it */}
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Unlimited
              <Switch checked={unlimited} onChange={setUnlimited} label="Unlimited: every comment the account has" />
            </label>
          </div>
          {unlimited ? (
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Every comment the account has, newest first.
            </p>
          ) : (
            <>
              <input
                id="limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_COMMENTS}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-invalid={!limitOk}
                aria-describedby="limit-hint"
                className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm tabular-nums outline-hidden focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-900 dark:focus:ring-zinc-700 ${
                  limitOk ? "border-zinc-200 dark:border-zinc-700" : "border-red-400 dark:border-red-700"
                }`}
              />
              <p id="limit-hint" className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {limitOk ? (
                  contacts ? (
                    "The newest comments, searched for contacts."
                  ) : (
                    "Newest first."
                  )
                ) : (
                  <span className="text-red-600 dark:text-red-400">1 to {MAX_COMMENTS}.</span>
                )}
              </p>
            </>
          )}
        </div>

        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
          LinkedIn leaves a few comments out of this list every time it loads it, so the list is read {PASSES} times
          and the results are combined.
          {unlimited
            ? " With Unlimited the whole list is read each time: about 3 minutes for every 100 comments the account has."
            : limitOk && ` This lookup takes up to ~${roughTime(limitN, PASSES)}.`}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {blockedReason && <p className="text-xs text-zinc-500 sm:mr-auto dark:text-zinc-400">{blockedReason}</p>}
          <button type="submit" disabled={blocked || !name || !limitOk} className={`${PRIMARY} sm:min-w-40`}>
            <Icon name="search" />
            {starting ? "Starting..." : contacts ? "Find contacts" : "Find comments"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Results({
  view,
  link,
  current,
  stopping,
  onStop,
  onShow,
}: {
  view: View | null;
  link: ApiLink;
  current: Run | null;
  stopping: boolean;
  onStop: (id: string) => void;
  onShow: (run: Run) => void;
}) {
  const run = view?.run ?? null;
  const running = run?.status === "running";
  const now = useNow(running);
  const result = view?.result ?? null;
  const [query, setQuery] = useState("");
  // how many comments are rendered; starts again at PAGE for another lookup or search
  const [page, setPage] = useState({ key: "", n: PAGE });

  const comments = useMemo(() => result?.comments ?? [], [result]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return comments;
    return comments.filter((c) =>
      [c.text, c.post.author, c.post.text, c.reply_to?.author, c.reply_to?.text].some((s) =>
        s?.toLowerCase().includes(q),
      ),
    );
  }, [comments, query]);
  // Only contacts: the contacts, each shown with the newest comment it is in
  const contacts = useMemo(() => result?.contacts ?? [], [result]);
  const byId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((t) => {
      const c = byId.get(t.comment_id);
      return [t.value, TYPE_LABEL[t.type] ?? t.type, c?.text, c?.post.author].some((s) => s?.toLowerCase().includes(q));
    });
  }, [contacts, byId, query]);
  const pageKey = `${view?.id}|${query}`;
  const shown = page.key === pageKey ? page.n : PAGE;

  if (!view) {
    return (
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="message" />
          {link === "online" ? "No lookups yet" : link === "token" ? "Lookups can't be loaded" : "Waiting for the scraper API"}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {link === "online"
            ? "Enter a username or profile URL and press Find comments. The comments show up here as they are found."
            : link === "token"
              ? "They show up here once the API token matches."
              : "Earlier lookups and their comments show up here once the API is reachable."}
        </p>
      </div>
    );
  }

  const lookup = run?.kind === "comments" ? run : null;
  const username = lookup?.username ?? result?.username ?? "";
  const name = result?.name ?? null;
  const profile = safeUrl(lookup?.profile ?? result?.profile ?? null);
  const elapsed = lookup ? (running ? now / 1000 : (lookup.ended_at ?? lookup.started_at)) - lookup.started_at : null;
  const isCurrent = current?.id === view.id;
  const count = result ? (result.comments_read ?? result.comments.length) : (lookup?.comments_found ?? 0);
  const contactsMode = contactsOnly(lookup, result);
  const contactCount = result?.contacts ? result.contacts.length : (lookup?.contacts_found ?? 0);
  // what the list shows: the comments, or with Only contacts the contacts found in them
  const total = contactsMode ? contacts.length : comments.length;
  const matches = contactsMode ? filteredContacts.length : filtered.length;
  // another lookup runs while an earlier one is on screen: offer to switch, like the Commands page does
  const elsewhere = current?.kind === "comments" && current.status === "running" && !isCurrent ? current : null;

  return (
    <div className={`${CARD} overflow-hidden`}>
      {elsewhere && (
        <button
          type="button"
          onClick={() => onShow(elsewhere)}
          className="flex w-full items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-left text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-inset dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
          <span className="flex-1">A lookup for {elsewhere.username ?? "another account"} is running</span>
          <span className="underline underline-offset-2">Show it</span>
        </button>
      )}
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={EYEBROW}>
              {running ? "Collecting now" : contactsMode ? "Contacts in comments by" : "Comments by"}
            </div>
            <h2 className="mt-1 truncate text-base font-semibold">
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

        {lookup && (
          <dl className={`grid gap-2 text-xs ${contactsMode ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            {contactsMode && (
              <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
                <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                  <Icon name="users" className="h-3 w-3" />
                  Contacts
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{contactCount}</dd>
              </div>
            )}
            <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="message" className="h-3 w-3" />
                {contactsMode ? "Comments read" : "Comments"}
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{count}</dd>
            </div>
            <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="clock" className="h-3 w-3" />
                Elapsed
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums" suppressHydrationWarning>
                {elapsed === null || (!running && lookup.ended_at === null) ? "–" : duration(elapsed)}
              </dd>
            </div>
            <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
              <dt className="text-zinc-500 dark:text-zinc-400">Started</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                <LocalTime epoch={lookup.started_at} />
              </dd>
            </div>
          </dl>
        )}

        {lookup && (
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            {commentsResult(withCount(lookup, result), result?.reached_end)}
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
            server: stop it and upload a session file on the Commands page.
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
      </div>

      {total > 0 && result && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5 dark:border-zinc-800">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{contactsMode ? "Search these contacts" : "Search these comments"}</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={contactsMode ? "Search contacts and their comments" : "Search comments and posts"}
              className="block w-full rounded-lg border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm outline-hidden focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-700"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              contactsMode ? downloadContactsCsv(result, filteredContacts, byId) : downloadCsv(result, filtered)
            }
            className={SECONDARY}
          >
            <Icon name="download" />
            {query.trim() ? `CSV (${matches})` : "CSV"}
          </button>
        </div>
      )}

      {total > 0 && (
        <>
          {query.trim() && (
            <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 sm:px-5 dark:border-zinc-800 dark:text-zinc-400">
              {matches} of {total} {contactsMode ? "contacts" : "comments"} match.
            </p>
          )}
          <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {contactsMode
              ? filteredContacts
                  .slice(0, shown)
                  .map((t) => <ContactCard key={`${t.type}:${t.value}`} contact={t} comment={byId.get(t.comment_id)} />)
              : filtered.slice(0, shown).map((c) => <CommentCard key={c.id} comment={c} />)}
          </ul>
          {matches > shown && (
            <button
              type="button"
              onClick={() => setPage({ key: pageKey, n: shown + PAGE })}
              className="w-full border-t border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
            >
              Show {Math.min(PAGE, matches - shown)} more ({matches - shown} left)
            </button>
          )}
        </>
      )}

      {!view.loaded && (
        <p className="border-t border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 sm:px-5 dark:border-zinc-800 dark:text-zinc-400">
          Loading...
        </p>
      )}

      {lookup && <OutputLog key={lookup.id} runId={lookup.id} running={running} />}
    </div>
  );
}

function CommentCard({ comment: c }: { comment: UserComment }) {
  const [open, setOpen] = useState(false);
  // "Show all" only when six lines really cut the text off, at this width
  const [clipped, setClipped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (!el || open) return;
    const observer = new ResizeObserver(() => setClipped(el.scrollHeight > el.clientHeight + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, c.text]);

  const url = safeUrl(c.url);
  const postUrl = safeUrl(c.post.url);
  const authorUrl = safeUrl(c.post.author_url);
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{commentDate(c)}</span>
        {c.reply_to && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            <Icon name="reply" className="h-3 w-3" />
            Reply
          </span>
        )}
        <span className="flex-1" />
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
            Open comment
            <Icon name="external" className="h-3 w-3" />
          </a>
        )}
      </div>
      <p
        ref={textRef}
        className={`mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${open ? "" : "line-clamp-6"}`}
      >
        {c.text || <span className="text-zinc-400 italic">No text (an image or a reaction only)</span>}
      </p>
      {(clipped || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 text-xs font-medium text-zinc-600 hover:underline dark:text-zinc-300"
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
      {c.reply_to && (
        <p className="mt-2 line-clamp-2 border-l-2 border-zinc-200 pl-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Replying to <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.reply_to.author || "a comment"}</span>
          {c.reply_to.text && `: ${c.reply_to.text}`}
        </p>
      )}
      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">On a post by</span>
          {authorUrl ? (
            <a href={authorUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
              {c.post.author || "someone"}
            </a>
          ) : (
            <span className="font-medium">{c.post.author || "someone"}</span>
          )}
          <span className="flex-1" />
          {postUrl && (
            <a href={postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
              Open post
              <Icon name="external" className="h-3 w-3" />
            </a>
          )}
        </div>
        {c.post.text && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{c.post.text}</p>
        )}
      </div>
    </li>
  );
}

// the contacts dashboard's row buttons
const ACTION_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150 active:scale-90";
const ACTION_IDLE =
  "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const ACTION_DONE =
  "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400";

// One contact found in the comments, with the newest comment it is in.
function ContactCard({ contact: t, comment: c }: { contact: CommentContact; comment?: UserComment }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(t.value);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. plain http on another device): the value is still selectable
    }
  }

  const href = hrefFor(t);
  const url = safeUrl(c?.url);
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[t.type] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
            >
              {TYPE_LABEL[t.type] ?? t.type}
            </span>
            <span className="min-w-0 font-mono text-sm break-all">{t.value}</span>
          </div>
          {c && (
            <>
              {c.text && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed break-words text-zinc-600 dark:text-zinc-400">
                  {c.text}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="tabular-nums">{commentDate(c)}</span>
                {t.count > 1 && <span>· in {t.count} comments</span>}
                {c.post.author && <span className="min-w-0 truncate">· on a post by {c.post.author}</span>}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium hover:underline"
                  >
                    Open comment
                    <Icon name="external" className="h-3 w-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Open"
              aria-label={`Open ${t.value}`}
              className={`${ACTION_BTN} ${ACTION_IDLE}`}
            >
              <Icon name="external" className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={copy}
            title={copied ? "Copied!" : "Copy"}
            aria-label={`Copy ${t.value}`}
            className={`${ACTION_BTN} ${copied ? ACTION_DONE : ACTION_IDLE}`}
          >
            <Icon name={copied ? "check" : "copy"} className={copied ? "animate-pop h-4 w-4" : "h-4 w-4"} />
          </button>
        </div>
      </div>
    </li>
  );
}

// The script's raw output, loaded only when opened; it follows new lines unless scrolled up.
function OutputLog({ runId, running }: { runId: string; running: boolean }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState({ lines: [] as string[], received: 0, loaded: false, gone: false });
  const nextRef = useRef(0);
  const preRef = useRef<HTMLPreElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const data = await api<RunLog>(`runs/${runId}?since=${nextRef.current}`);
        if (cancelled) return;
        nextRef.current = data.next;
        setLog((l) => ({
          lines: [...l.lines, ...data.lines].slice(-2000),
          received: l.received + data.lines.length,
          loaded: true,
          gone: false,
        }));
        if (data.run.status !== "running") return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          if (!cancelled) setLog((l) => ({ ...l, loaded: true, gone: true }));
          return;
        }
        // API briefly unreachable: keep trying
      }
      if (!cancelled) timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, runId, running]);

  // keep the newest line in view, unless the user has scrolled up to read
  useEffect(() => {
    const el = preRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [log.received, open]);

  return (
    <details
      className="border-t border-zinc-200 dark:border-zinc-800"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={`${EYEBROW} flex cursor-pointer items-center gap-1.5 px-4 py-3 select-none sm:px-5`}>
        <Icon name="terminal" className="h-3.5 w-3.5" />
        Scraper output
      </summary>
      <pre
        ref={preRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
        }}
        className="max-h-72 overflow-auto bg-zinc-950 px-4 py-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-200"
      >
        {log.lines.length
          ? log.lines.join("\n")
          : log.gone
            ? "This lookup is no longer on the scraper API."
            : !log.loaded
              ? "Loading output..."
              : running
                ? "Waiting for output..."
                : "No output."}
      </pre>
    </details>
  );
}

function Lookups({
  runs,
  fresh,
  viewId,
  onShow,
}: {
  runs: Run[];
  fresh: Run[];
  viewId?: string;
  onShow: (run: Run) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (runs.length === 0) return null;
  return (
    <section aria-labelledby="lookups-title">
      <h2 id="lookups-title" className={`${EYEBROW} mb-3 flex items-center gap-1.5`}>
        <Icon name="history" className="h-3.5 w-3.5" />
        Earlier lookups
      </h2>
      <div className={`${CARD} overflow-hidden`}>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {runs.slice(0, expanded ? runs.length : LOOKUP_ROWS).map((listed) => {
            // the list is only reloaded when a job starts or ends: take the running or open lookup's live copy
            const run = fresh.find((f) => f.id === listed.id) ?? listed;
            return (
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
                    <span className="block truncate font-medium">{run.username ?? run.title}</span>
                    <span className="block text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      <LocalTime epoch={run.started_at} /> ·{" "}
                      {run.contacts_only
                        ? `${run.contacts_found ?? 0} contacts · ${run.comments_found ?? 0} comments read`
                        : `${run.comments_found ?? 0} comments`}
                    </span>
                  </span>
                  <StatusPill status={run.status} />
                </button>
              </li>
            );
          })}
        </ul>
        {runs.length > LOOKUP_ROWS && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="w-full border-t border-zinc-200 px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
          >
            {expanded ? "Show fewer" : `Show ${runs.length - LOOKUP_ROWS} more`}
          </button>
        )}
      </div>
    </section>
  );
}
