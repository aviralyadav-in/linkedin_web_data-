"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hrefFor } from "@/lib/contact-links";
import type {
  CommentContact,
  ContactPost,
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
export const MAX_COMMENTS = 5000;
export const DEFAULT_LIMIT = 200;
const PAGE = 50; // comments rendered at a time
export const RUN_ID_RE = /^[\w-]{1,64}$/;

// The same rules as linkedin_comments.py's parse_profile: a username, or a linkedin.com/in/<username> URL.
// Letters of any script with their vowel signs and other marks (\p{M}), digits, - and _.
const PROFILE_URL_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)\/?(?:[/?#]\S*)?$/i;
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{2,99}$/u;

export function parseProfile(text: string) {
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

export const profileUrl = (name: string) => `https://www.linkedin.com/in/${encodeURIComponent(name)}/`;

// only plain https links are rendered as links (the data comes from scraped pages)
export const safeUrl = (url: string | null | undefined) => (url && /^https:\/\//i.test(url) ? url : null);

// the counts in the result file are the real ones; the run's own counts can lag behind them
const withCount = (run: Run, result: CommentsResult | null): Run =>
  result
    ? {
        ...run,
        comments_found: result.comments_read ?? result.comments.length,
        ...(result.contacts && { contacts_found: result.contacts.length }),
        ...(result.posts_read !== undefined && { posts_found: result.posts_read }),
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

// A lookup that stopped part-way (it failed, was stopped, or the API stopped while it ran) can go on from where it
// stopped; not one that finished, or one whose profile doesn't exist (exit 5) or was no profile at all (exit 2).
export const continuable = (run: Run, complete: boolean | undefined) =>
  (run.status === "failed" || run.status === "stopped" || run.status === "interrupted") &&
  run.exit_code !== 2 &&
  run.exit_code !== 5 &&
  !complete;

export function continueErrorText(e: unknown) {
  const status = e instanceof ApiError ? e.status : 0;
  if (status === 422) return "This lookup can't be continued: it has finished, or its files are gone from the scraper API.";
  if (status === 404) return `The scraper API can't continue this lookup. ${RESTART_API}, then try again.`;
  return errorText(e);
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
export function csvCell(value: string | null | undefined) {
  const v = value ?? "";
  return `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
}

// A contact value is short, so it gets the dashboard's ="..." wrapper: it also stops Excel from turning a phone
// number into 9.18E+11.
export function valueCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /^[=+\-@\t\r\d]/.test(value) ? `="${escaped}"` : `"${escaped}"`;
}

export function saveCsv(head: string[], lines: string[], filename: string) {
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

// where a contact of a lookup was found: the newest of the account's comments with it, the newest of its posts
// with it (and the text in that post), the About section
type Sources = { comments: Map<string, UserComment>; posts: Map<string, ContactPost>; about: string };

function sourcesOf(result: CommentsResult | null): Sources {
  return {
    comments: new Map((result?.comments ?? []).map((c) => [c.id, c])),
    posts: new Map((result?.posts ?? []).map((p) => [p.urn, p])),
    about: result?.about?.text ?? "",
  };
}

function foundIn(t: CommentContact, sources: Sources) {
  const comment = t.comment_id ? sources.comments.get(t.comment_id) : undefined;
  const post = t.post ? sources.posts.get(t.post) : undefined;
  const hit = post?.contacts.find((x) => x.type === t.type && x.value === t.value);
  return { comment, post, hit, about: !!t.about };
}

function downloadContactsCsv(result: CommentsResult, rows: CommentContact[], sources: Sources) {
  const head = [
    "Type",
    "Value",
    "Comments with it",
    "Newest comment date",
    "Comment",
    "Post author",
    "Comment link",
    "In About",
    "Posts with it",
    "Text in the newest post",
    "Post link",
  ];
  const lines = rows.map((t) => {
    const { comment: c, post, hit } = foundIn(t, sources);
    return [
      csvCell(TYPE_LABEL[t.type] ?? t.type),
      valueCell(t.value),
      ...[
        String(t.count),
        c ? (c.date ?? c.time) : "",
        c?.text,
        c?.post.author,
        c?.url,
        t.about ? "yes" : "",
        String(t.posts ?? 0),
        hit?.text,
        post?.url,
      ].map(csvCell),
    ].join(",");
  });
  saveCsv(head, lines, `contacts_${result.username}.csv`);
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
  const [pending, setPending] = useState<"start" | "stop" | "continue" | null>(null);

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

  // a lookup that stopped part-way goes on from where it stopped: a new run that starts with what it found
  async function goOn(id: string) {
    setPending("continue");
    setMessage(null);
    try {
      const run = await post<Run>(`comments/${id}/resume`);
      busyRef.current = true;
      followedRef.current = run.id;
      setStatus((s) => ({ busy: true, current: run, last: s?.last ?? null }));
      open(run);
      pollSoonRef.current(); // switch the status poll to its fast, running pace
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
  // the newest copies of the runs in the list: the running job and the lookup on screen
  const fresh = [current, shown].filter((r): r is Run => r !== null);
  // another lookup runs while an earlier one is on screen: offer to switch, like the Commands page does
  const elsewhere =
    current?.kind === "comments" && current.status === "running" && current.id !== view?.id ? current : null;

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
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" />
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
                          : current?.kind !== "comments"
                            ? "A scraper run is in progress. Wait for it to finish, or stop it on the Commands page."
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

            {/* the comments (or contacts) as a table; the scraper output (the logs) sits at its bottom.
                scroll-mt clears the sticky header, which is two rows (title, tabs) on a phone */}
            <section ref={resultsRef} aria-label="Comments" className="min-w-0 scroll-mt-32 sm:scroll-mt-20">
              <CommentsTable view={view} lookups={lookups} fresh={fresh} onShow={open} />
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
  onStart: (profile: string, limit: number | null, contacts: boolean) => void;
}) {
  const [profile, setProfile] = useState("");
  const [mode, setMode] = useState<"all" | "contacts">("contacts");
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
    <form
      onSubmit={submit}
      className="flex min-w-0 flex-col border-b border-zinc-200 lg:border-r lg:border-b-0 dark:border-zinc-800"
      aria-labelledby="lookup-title"
    >
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-transparent px-4 py-4 sm:px-5 dark:border-zinc-800 dark:from-zinc-900/60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-600 text-white shadow-md shadow-zinc-900/20 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900">
          <Icon name="message" />
        </span>
        <h2 id="lookup-title" className="min-w-0 text-base font-semibold tracking-tight">
          Find comments
        </h2>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
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
          <div className="mt-1.5 grid gap-2">
            {(
              [
                { value: "all", title: "All comments", text: "Every comment, with the post it is on." },
                {
                  value: "contacts",
                  title: "Only contacts",
                  text: "Email, phone, WhatsApp, Telegram and mentioned LinkedIn profiles: from the comments, the About section and all of the account's posts with their comments. Also added to the contacts table.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-zinc-400 ${
                  mode === option.value
                    ? "border-zinc-900 bg-zinc-50 shadow-sm ring-1 ring-zinc-900 dark:border-zinc-100 dark:bg-zinc-900 dark:ring-zinc-100"
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

        <div>
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
              {contacts ? "Every comment and every post the account has." : "Every comment the account has, newest first."}
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
                className={`mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm tabular-nums outline-hidden focus:ring-2 focus:ring-zinc-300 sm:max-w-xs dark:bg-zinc-900 dark:focus:ring-zinc-700 ${
                  limitOk ? "border-zinc-200 dark:border-zinc-700" : "border-red-400 dark:border-red-700"
                }`}
              />
              <p id="limit-hint" className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {limitOk ? (
                  contacts ? (
                    "The newest comments. The account's posts are all read, whatever this number is."
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

        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {blockedReason && <p className="text-xs text-zinc-500 sm:mr-auto dark:text-zinc-400">{blockedReason}</p>}
          <button
            type="submit"
            disabled={blocked || !name || !limitOk}
            className={`${PRIMARY} shadow-md shadow-zinc-900/15 sm:min-w-44`}
          >
            <Icon name="search" />
            {starting ? "Starting..." : contacts ? "Find contacts" : "Find comments"}
          </button>
        </div>
      </div>
    </form>
  );
}

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
        <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <Icon name="message" className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-semibold">
          {link === "online" ? "No lookups yet" : link === "token" ? "Lookups can't be loaded" : "Waiting for the scraper API"}
        </p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
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
  // posts of the account read; undefined from a scraper that only reads the comments
  const postCount = result ? result.posts_read : lookup?.posts_found;

  return (
    <div className="min-w-0 space-y-4 bg-gradient-to-b from-zinc-50/90 to-transparent p-4 sm:p-5 dark:from-zinc-900/50">
        <div className="flex items-start justify-between gap-3">
          {/* a div, not a span: the tests (and styles) treat span.rounded-full as a badge/status pill */}
          <div
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-900 to-zinc-600 text-base font-semibold text-white uppercase shadow-md shadow-zinc-900/20 ring-2 ring-white dark:from-zinc-100 dark:to-zinc-400 dark:text-zinc-900 dark:ring-zinc-800"
          >
            {(name ?? username).trim().charAt(0) || <Icon name="message" className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className={EYEBROW}>
              {running ? "Collecting now" : contactsMode ? "Contacts found for" : "Comments by"}
            </div>
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

        {lookup && (
          <dl
            className={`grid gap-2 text-xs ${
              !contactsMode ? "grid-cols-3" : postCount === undefined ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-5"
            }`}
          >
            {contactsMode && (
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                  <Icon name="users" className="h-3 w-3" />
                  Contacts
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{contactCount}</dd>
              </div>
            )}
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="message" className="h-3 w-3" />
                {contactsMode ? "Comments read" : "Comments"}
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{count}</dd>
            </div>
            {contactsMode && postCount !== undefined && (
              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                  <Icon name="flag" className="h-3 w-3" />
                  Posts read
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {postCount}
                  {typeof result?.posts_total === "number" && result.posts_total > postCount && (
                    <span className="font-normal text-zinc-500 dark:text-zinc-400"> of {result.posts_total}</span>
                  )}
                </dd>
              </div>
            )}
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <Icon name="clock" className="h-3 w-3" />
                Elapsed
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums" suppressHydrationWarning>
                {elapsed === null || (!running && lookup.ended_at === null) ? "–" : duration(elapsed)}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/60">
              <dt className="text-zinc-500 dark:text-zinc-400">Started</dt>
              <dd className="mt-2 text-sm font-semibold tabular-nums">
                <LocalTime epoch={lookup.started_at} />
              </dd>
            </div>
          </dl>
        )}

        {lookup && (
          <p className="rounded-lg border-l-2 border-zinc-300 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-200">
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
              A new run keeps the {contactsMode ? "comments, contacts and posts" : "comments"} found so far and goes on
              from where this lookup stopped, not from the beginning.
            </p>
          </div>
        )}
    </div>
  );
}

// the sticky header cell of the table
const TH =
  "sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-left font-medium whitespace-nowrap sm:px-5 dark:border-zinc-800 dark:bg-zinc-900";

// The comments (or, with Only contacts, the contacts) as a compact table in a fixed frame: the rows scroll
// inside it, not the page. The toolbar holds the earlier-lookups picker, the search and the CSV download;
// the scraper output (the logs) closes the card.
function CommentsTable({
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
  // how many rows are rendered; starts again at PAGE for another lookup or search
  const [page, setPage] = useState({ key: "", n: PAGE });
  const run = view?.run ?? null;
  const lookup = run?.kind === "comments" ? run : null;
  const running = run?.status === "running";
  const result = view?.result ?? null;
  const profile = safeUrl(lookup?.profile ?? result?.profile ?? null);
  const contactsMode = contactsOnly(lookup, result);

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
  // Only contacts: the contacts, each shown with where it was found
  const contacts = useMemo(() => result?.contacts ?? [], [result]);
  const sources = useMemo(() => sourcesOf(result), [result]);
  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((t) => {
      // the text its row shows: the account's comment, else the post or comment on its post, else the About section
      const { comment: c, hit, about } = foundIn(t, sources);
      const shownText = c ? [c.text, c.post.author] : hit ? [hit.text, hit.author] : about ? [sources.about] : [];
      return [t.value, TYPE_LABEL[t.type] ?? t.type, ...shownText].some((s) => s?.toLowerCase().includes(q));
    });
  }, [contacts, sources, query]);
  // what the table shows: the comments, or with Only contacts the contacts found in them
  const total = contactsMode ? contacts.length : comments.length;
  const matches = contactsMode ? filteredContacts.length : filtered.length;
  const pageKey = `${view?.id}|${query}`;
  const shownN = page.key === pageKey ? page.n : PAGE;

  // the picker's rows: the earlier lookups (with live counts), plus the one on screen if it isn't listed yet
  const options = useMemo(() => {
    const merged = lookups.map((listed) => fresh.find((f) => f.id === listed.id) ?? listed);
    const shownRun = view?.run;
    if (shownRun && shownRun.kind === "comments" && !merged.some((r) => r.id === shownRun.id)) merged.unshift(shownRun);
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
                    · <LocalTime epoch={r.started_at} /> ·{" "}
                    {r.contacts_only ? `${r.contacts_found ?? 0} contacts` : `${r.comments_found ?? 0} comments`} ·{" "}
                    {STATUS[r.status].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
            result &&
            (contactsMode ? downloadContactsCsv(result, filteredContacts, sources) : downloadCsv(result, filtered))
          }
          disabled={!result || matches === 0}
          className={SECONDARY}
        >
          <Icon name="download" />
          {query.trim() ? `CSV (${matches})` : "CSV"}
        </button>
      </div>

      {!view ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          The comments show up here as a table once a lookup runs.
        </p>
      ) : !view.loaded ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">Loading...</p>
      ) : view.gone ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          This lookup is no longer on the scraper API.
        </p>
      ) : total === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          {running
            ? `Reading the comments... ${contactsMode ? "contacts" : "they"} show up here as they are found.`
            : contactsMode
              ? "No contacts in this lookup."
              : "No comments in this lookup."}
        </p>
      ) : matches === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5 dark:text-zinc-400">
          No {contactsMode ? "contacts" : "comments"} match this search.
        </p>
      ) : (
        <>
          <p className="border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500 sm:px-5 dark:border-zinc-800 dark:text-zinc-400">
            {query.trim()
              ? `${matches} of ${total} ${contactsMode ? "contacts" : "comments"} match.`
              : `${total} ${contactsMode ? (total === 1 ? "contact" : "contacts") : total === 1 ? "comment" : "comments"}.`}
          </p>
          {/* the fixed frame: the table scrolls in here, sideways too when it needs more room */}
          <div className="max-h-[62dvh] overflow-auto overscroll-contain">
            {contactsMode ? (
              <table className="w-full min-w-4xl table-fixed text-sm">
                <thead className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  <tr>
                    <th className={`${TH} w-28`}>Type</th>
                    <th className={`${TH} w-80`}>Contact</th>
                    <th className={TH}>Found in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredContacts.slice(0, shownN).map((t) => (
                    <ContactRow key={`${t.type}:${t.value}`} contact={t} sources={sources} profile={profile} />
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-6xl table-fixed text-sm">
                <thead className="text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  <tr>
                    <th className={`${TH} w-40`}>Date</th>
                    <th className={TH}>Comment</th>
                    <th className={`${TH} w-64`}>Reply to</th>
                    <th className={`${TH} w-80`}>On a post by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filtered.slice(0, shownN).map((c) => (
                    <CommentRow key={c.id} comment={c} />
                  ))}
                </tbody>
              </table>
            )}
            {matches > shownN && (
              <button
                type="button"
                onClick={() => setPage({ key: pageKey, n: shownN + PAGE })}
                className="w-full border-t border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
              >
                Show {Math.min(PAGE, matches - shownN)} more ({matches - shownN} left)
              </button>
            )}
          </div>
        </>
      )}

      {lookup && <OutputLog key={lookup.id} runId={lookup.id} running={running ?? false} />}
    </div>
  );
}

// One comment per row: when, the text, what it replies to, and the post it is on — every link kept clickable.
function CommentRow({ comment: c }: { comment: UserComment }) {
  const [open, setOpen] = useState(false);
  // "Show all" only when four lines really cut the text off, at this width
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
    <tr className="align-top transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30">
      <td className="px-4 py-2.5 sm:px-5">
        <div className="text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{commentDate(c)}</div>
        {c.reply_to && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            <Icon name="reply" className="h-3 w-3" />
            Reply
          </span>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Open comment
            <Icon name="external" className="h-3 w-3" />
          </a>
        )}
      </td>
      <td className="px-4 py-2.5 sm:px-5">
        <p
          ref={textRef}
          className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${open ? "" : "line-clamp-4"}`}
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
      </td>
      <td className="px-4 py-2.5 sm:px-5">
        {c.reply_to ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{c.reply_to.author || "A comment"}</span>
            {c.reply_to.text && `: ${c.reply_to.text}`}
          </p>
        ) : (
          <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 sm:px-5">
        <div className="text-xs">
          {authorUrl ? (
            <a href={authorUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
              {c.post.author || "someone"}
            </a>
          ) : (
            <span className="font-medium">{c.post.author || "someone"}</span>
          )}
        </div>
        {c.post.text && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{c.post.text}</p>
        )}
        {postUrl && (
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 flex items-center gap-1 text-xs font-medium text-zinc-500 hover:underline dark:text-zinc-400"
          >
            Open post
            <Icon name="external" className="h-3 w-3" />
          </a>
        )}
      </td>
    </tr>
  );
}

// the contacts dashboard's row buttons
const ACTION_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150 active:scale-90";
const ACTION_IDLE =
  "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const ACTION_DONE =
  "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400";

// One contact a lookup found, as a row, with where: the newest of the account's comments that has it, or else the
// newest of its posts that has it (in the post or a comment on it), or else the About section.
function ContactRow({
  contact: t,
  sources,
  profile,
}: {
  contact: CommentContact;
  sources: Sources;
  profile: string | null;
}) {
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
  const { comment: c, post, hit, about } = foundIn(t, sources);
  const url = safeUrl(c?.url);
  const postUrl = safeUrl(post?.url);
  const posts = t.posts ?? 0;
  const postDate = post?.date ? new Date(post.date) : null;
  // the text the contact is in, when there is no comment of the account to show
  const text = c ? null : hit ? hit.text : about ? sources.about : null;
  return (
    <tr className="align-top transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/30">
      <td className="px-4 py-2.5 sm:px-5">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[t.type] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
        >
          {TYPE_LABEL[t.type] ?? t.type}
        </span>
      </td>
      <td className="px-4 py-2.5 sm:px-5">
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 font-mono text-sm break-all">{t.value}</span>
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
      </td>
      <td className="px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          {c && (
            <>
              {c.text && (
                <p className="line-clamp-2 text-xs leading-relaxed break-words text-zinc-600 dark:text-zinc-400">
                  {c.text}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="tabular-nums">{commentDate(c)}</span>
                {t.count > 1 && <span>· in {t.count} comments</span>}
                {c.post.author && <span className="min-w-0 truncate">· on a post by {c.post.author}</span>}
                {about && <span>· in the About section</span>}
                {posts > 0 && <span>· on {posts === 1 ? "1 of their posts" : `${posts} of their posts`}</span>}
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
          {!c && (text || about || post) && (
            <>
              {text && (
                <p className="line-clamp-2 text-xs leading-relaxed break-words text-zinc-600 dark:text-zinc-400">
                  {text}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                {post ? (
                  <>
                    {postDate && !Number.isNaN(postDate.getTime()) && (
                      <span className="tabular-nums">
                        {postDate.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} ·
                      </span>
                    )}
                    <span className="min-w-0 truncate">
                      {hit?.comment ? `In a comment${hit.author ? ` by ${hit.author}` : ""} on their post` : "In their post"}
                    </span>
                    {posts > 1 && <span>· on {posts} of their posts</span>}
                    {about && <span>· in the About section</span>}
                    {postUrl && (
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        Open post
                        <Icon name="external" className="h-3 w-3" />
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <span>In the About section</span>
                    {profile && (
                      <a
                        href={profile}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        Open profile
                        <Icon name="external" className="h-3 w-3" />
                      </a>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          {!c && !text && !about && !post && <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>}
        </div>
      </td>
    </tr>
  );
}

// The script's raw output, loaded only when opened; it follows new lines unless scrolled up.
export function OutputLog({ runId, running }: { runId: string; running: boolean }) {
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
      className="group border-t border-zinc-200 dark:border-zinc-800"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className={`${EYEBROW} flex cursor-pointer items-center gap-1.5 px-4 py-3 transition-colors select-none group-open:bg-zinc-900 group-open:text-zinc-300 hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-900/60 dark:group-open:bg-zinc-900`}
      >
        {/* divs, not spans: span.rounded-full is reserved for badges/status pills (the tests rely on it) */}
        <div className="mr-1 hidden gap-1 group-open:flex" aria-hidden="true">
          <div className="h-2 w-2 rounded-full bg-red-400" />
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
        </div>
        <Icon name="terminal" className="h-3.5 w-3.5" />
        Scraper output
        {running && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 normal-case dark:bg-emerald-950 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            LIVE
          </span>
        )}
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

