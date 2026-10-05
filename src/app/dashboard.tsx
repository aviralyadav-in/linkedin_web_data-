"use client";

import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { codeLabel, detailsFor, facetsOf, type Facets } from "@/lib/contact-facets";
import { hrefFor } from "@/lib/contact-links";

import { deleteContacts } from "./actions";
import { useScraperWatch } from "./scraper-status";

export type ContactRow = { type: string; value: string };
// a contact found in this LinkedIn account's comments (User comments, Only contacts)
export type SourceRow = ContactRow & { username: string };

const TYPES = [
  { key: "email", label: "Email", icon: "mail" },
  { key: "phone", label: "Phone", icon: "phone" },
  { key: "whatsapp", label: "WhatsApp", icon: "chat" },
  { key: "telegram", label: "Telegram", icon: "send" },
  { key: "linkedin", label: "LinkedIn", icon: "at" }, // a profile or page mentioned in a post or comment
] as const;

// the table's All view groups the rows in this same order: email first, LinkedIn last
const TYPE_RANK = new Map<string, number>(TYPES.map((t, i) => [t.key, i]));

const BADGE: Record<string, string> = {
  email: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  phone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  whatsapp: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  telegram: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  linkedin: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

const AUTO_REFRESH_MS = 30_000;

const keyOf = (c: ContactRow) => `${c.type}:${c.value}`;

const ICONS: Record<string, string> = {
  all: "m12 2 10 5-10 5L2 7l10-5ZM2 12l10 5 10-5M2 17l10 5 10-5",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6",
  phone:
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  chat: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
  send: "m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13",
  at: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm0-4v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8",
  search: "m21 21-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-16v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z",
  menu: "M3 6h18M3 12h18M3 18h18",
  x: "M18 6 6 18M6 6l12 12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  copy: "M9 11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9ZM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  check: "M20 6 9 17l-5-5",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14",
  trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m5 5v6m4-6v6",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3Z",
  sliders: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4",
  chevronUp: "m18 15-6-6-6 6",
  chevronDown: "m6 9 6 6 6-6",
  chevronsUpDown: "m7 15 5 5 5-5M7 9l5-5 5 5",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  reset: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5",
};

// row action buttons: subtle border, press-down animation, success turns green
const ACTION_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150 active:scale-90";
const ACTION_IDLE =
  "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const ACTION_DONE =
  "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400";
// the delete button turns red on hover, so it doesn't look like the harmless buttons next to it
const ACTION_DANGER =
  "border-zinc-200 text-zinc-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-400";

// contacts per delete request (deleteContacts takes up to 1000)
const DELETE_BATCH = 500;

function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof ICONS; className?: string }) {
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

// The "Updated" timestamp is client-only state (a data load's arrival time), modelled as
// a tiny external store so hydration stays consistent: the server renders nothing, and the
// component reads the stamp with useSyncExternalStore after each load.
type Feed = { updatedAt: Date | null };

const EMPTY_FEED: Feed = { updatedAt: null };
let feedCache: Feed = EMPTY_FEED;
const feedListeners = new Set<() => void>();

function subscribeFeed(cb: () => void) {
  feedListeners.add(cb);
  return () => {
    feedListeners.delete(cb);
  };
}
const getFeed = () => feedCache;
const getServerFeed = () => EMPTY_FEED;

function stampDataLoad() {
  feedCache = { updatedAt: new Date() };
  feedListeners.forEach((l) => l());
}

function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // theme still switches for this page view even if it can't be persisted
  }
}

// How the table looks, chosen under Customize and kept in this browser's localStorage. Like the "Updated" stamp
// it's an external store: the server (which can't read localStorage) renders the defaults, and the browser
// switches to the saved choice right after hydration, so the two never mismatch.
type Sort = { key: "type" | "value"; dir: "asc" | "desc" };
type Columns = { type: boolean; source: boolean; details: boolean; actions: boolean };
type Prefs = {
  cols: Columns;
  density: "comfortable" | "compact";
  wrap: boolean; // long values wrap onto more lines, or are cut to one line
  pageSize: number; // rows per page, 0 = every row on one page
  sort: Sort;
};

// v2: the defaults changed (every column, compact rows, no wrapping), so choices saved under v1 are left behind
const PREFS_KEY = "contacts-table-v2";
const PAGE_SIZES = [0, 25, 50, 100, 250];
const DEFAULT_SORT: Sort = { key: "type", dir: "asc" };
const DEFAULT_PREFS: Prefs = {
  cols: { type: true, source: true, details: true, actions: true },
  density: "compact",
  wrap: false,
  pageSize: 0,
  sort: DEFAULT_SORT,
};

const COLUMN_OPTIONS: { key: keyof Columns; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "source", label: "Source" },
  { key: "details", label: "Details" },
  { key: "actions", label: "Actions" },
];

const SORT_OPTIONS = [
  { value: "type:asc", label: "Type (default order)" },
  { value: "type:desc", label: "Type (reversed)" },
  { value: "value:asc", label: "Contact A → Z" },
  { value: "value:desc", label: "Contact Z → A" },
];

// whatever is stored is checked field by field; anything unexpected falls back to its default
function readPrefs(): Prefs {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
  } catch {
    return DEFAULT_PREFS;
  }
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  const cols = (r.cols && typeof r.cols === "object" ? r.cols : {}) as Record<string, unknown>;
  const sort = (r.sort && typeof r.sort === "object" ? r.sort : {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    cols: {
      type: bool(cols.type, DEFAULT_PREFS.cols.type),
      source: bool(cols.source, DEFAULT_PREFS.cols.source),
      details: bool(cols.details, DEFAULT_PREFS.cols.details),
      actions: bool(cols.actions, DEFAULT_PREFS.cols.actions),
    },
    density: r.density === "compact" || r.density === "comfortable" ? r.density : DEFAULT_PREFS.density,
    wrap: bool(r.wrap, DEFAULT_PREFS.wrap),
    pageSize: typeof r.pageSize === "number" && PAGE_SIZES.includes(r.pageSize) ? r.pageSize : 0,
    sort: { key: sort.key === "value" ? "value" : "type", dir: sort.dir === "desc" ? "desc" : "asc" },
  };
}

let prefsCache: Prefs | null = null;
const prefsListeners = new Set<() => void>();

const getPrefs = () => (prefsCache ??= readPrefs());
const getServerPrefs = () => DEFAULT_PREFS;

function subscribePrefs(cb: () => void) {
  prefsListeners.add(cb);
  // changed in another tab (null: that tab cleared the storage)
  const onStorage = (e: StorageEvent) => {
    if (e.key === PREFS_KEY || e.key === null) {
      prefsCache = readPrefs();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    prefsListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function savePrefs(next: Prefs) {
  prefsCache = next;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // still applies to this page view, it just isn't remembered
  }
  prefsListeners.forEach((l) => l());
}

const updatePrefs = (patch: Partial<Prefs>) => savePrefs({ ...getPrefs(), ...patch });

// The filters under the Filters button. They narrow the rows before the sidebar's type filter, so the sidebar
// counts follow them (like Filter by user). "all" = that filter is off.
type Filters = { source: string; link: string; domain: string; country: string; selection: string };
const NO_FILTERS: Filters = { source: "all", link: "all", domain: "all", country: "all", selection: "all" };

const SOURCE_LABEL: Record<string, string> = { comments: "From User comments", scraper: "Scraper runs only" };
const LINK_LABEL: Record<string, string> = { yes: "Has a link", no: "No link" };
const SELECTION_LABEL: Record<string, string> = { selected: "Selected only", unselected: "Not selected" };

type FacetRow = Facets & { link: boolean };

// the toolbar buttons above the table
const TOOL_BTN =
  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-95";
const TOOL_IDLE =
  "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500";
const TOOL_OPEN = "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900";
const FIELD_LABEL = "mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-300";

// a Select with its label above it, for the Filters and Customize panels
function LabeledSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

// The accounts whose comments a contact was found in; clicking one filters the table by that user.
function SourceCell({ names, onPick }: { names: string[] | undefined; onPick: (name: string) => void }) {
  if (!names?.length) return <span className="text-xs text-zinc-500 dark:text-zinc-400">Scraper run</span>;
  return (
    <div className="flex flex-wrap gap-1" title={names.length > 2 ? names.join(", ") : undefined}>
      {names.slice(0, 2).map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onPick(name)}
          title={`Show only contacts from ${name}`}
          className="max-w-40 truncate rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {name}
        </button>
      ))}
      {names.length > 2 && (
        <span className="rounded-full px-1.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">+{names.length - 2}</span>
      )}
    </div>
  );
}

// Asks before contacts are deleted. A native modal <dialog>: focus stays inside it and starts on Cancel, and
// Escape closes it (not while the delete runs).
function DeleteDialog({
  rows,
  hidden,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  rows: ContactRow[];
  hidden: number; // how many of them the current filter or search hides
  deleting: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const one = rows.length === 1 ? rows[0] : null;
  const hiddenNote =
    hidden === 0
      ? ""
      : one
        ? "It isn't shown with the current filter or search."
        : hidden === rows.length
          ? "None of them are shown with the current filter or search."
          : `${hidden} of them ${hidden === 1 ? "isn't" : "aren't"} shown with the current filter or search.`;

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        if (deleting) e.preventDefault();
      }}
      onClose={onClose}
      aria-labelledby="delete-title"
      aria-describedby="delete-about"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <h2 id="delete-title" className="text-base font-semibold">
        {one ? "Delete this contact?" : `Delete ${rows.length} contacts?`}
      </h2>
      {one && (
        <div className="mt-3 flex items-start gap-2">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[one.type] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
          >
            {TYPES.find((t) => t.key === one.type)?.label ?? one.type}
          </span>
          <span className="min-w-0 font-mono text-sm break-all">{one.value}</span>
        </div>
      )}
      <div id="delete-about" className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        {hiddenNote && <p>{hiddenNote}</p>}
        <p>
          {one ? "It is" : "They are"} removed from the database, and from Filter by user. This can&apos;t be undone,
          but a later run adds a contact again if it finds it again.
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          disabled={deleting}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium transition-all hover:border-zinc-400 active:scale-95 disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={deleting}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 active:scale-95 disabled:opacity-60 dark:bg-red-600 dark:hover:bg-red-500"
        >
          <Icon name="trash" />
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </dialog>
  );
}

export default function Dashboard({ contacts, sources }: { contacts: ContactRow[]; sources: SourceRow[] }) {
  const router = useRouter();
  const [type, setType] = useState("all");
  const [user, setUser] = useState(""); // "" = no user filter (a username has at least 3 characters)
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [feedback, setFeedback] = useState<{ key: string; kind: "copied" | "shared" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<ContactRow[] | null>(null); // waiting in the dialog for a yes
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, startDelete] = useTransition();
  const [notice, setNotice] = useState(""); // "Deleted 3 contacts." for a few seconds
  const { updatedAt } = useSyncExternalStore(subscribeFeed, getFeed, getServerFeed);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);
  const [tableFilters, setTableFilters] = useState<Filters>(NO_FILTERS);
  const [panel, setPanel] = useState<"filters" | "customize" | null>(null); // the panel open above the table
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [paging, setPaging] = useState({ key: "", page: 1 }); // the page, for the view `key` describes

  // In dev, React Strict Mode's remount resets <html> attributes; re-apply the stored
  // theme before paint (no-op in production). See the Next.js "Preventing Flash" guide.
  useLayoutEffect(() => {
    try {
      let t = localStorage.getItem("theme");
      if (t !== "light" && t !== "dark") {
        t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      document.documentElement.setAttribute("data-theme", t);
    } catch {
      // localStorage unavailable -> keep the server default
    }
  }, []);

  // Stamp the arrival time of each data load for the "Updated" indicator.
  useEffect(() => {
    stampDataLoad();
  }, [contacts]);

  // The mobile drawer behaves like a dialog: focus moves into it on open, Escape
  // closes it, and focus returns to the menu button afterwards.
  useEffect(() => {
    if (sidebarOpen) {
      drawerWasOpen.current = true;
      drawerRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setSidebarOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      menuBtnRef.current?.focus();
    }
  }, [sidebarOpen]);

  const refresh = () => startRefresh(() => router.refresh());
  useScraperWatch(refresh);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => startRefresh(() => router.refresh()), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, router, startRefresh]);

  // the accounts whose comments contacts came from, each with the keys of its contacts
  const users = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of sources) {
      let keys = m.get(s.username);
      if (!keys) m.set(s.username, (keys = new Set()));
      keys.add(keyOf(s));
    }
    return m;
  }, [sources]);
  // a user that no longer has contacts (e.g. after a refresh) means no user filter
  const activeUser = users.has(user) ? user : "";

  // the contacts the user filter leaves; the other filters, the type filter and its counts work within them
  const scoped = useMemo(() => {
    const keys = users.get(activeUser);
    return keys ? contacts.filter((c) => keys.has(keyOf(c))) : contacts;
  }, [contacts, users, activeUser]);

  // what each contact's value says about it, for the filters and the Details column
  const facets = useMemo(
    () => new Map<string, FacetRow>(contacts.map((c) => [keyOf(c), { ...facetsOf(c), link: hrefFor(c) !== null }])),
    [contacts],
  );

  // the accounts whose comments each contact was found in (Source column and filter)
  const sourceOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of sources) {
      const k = keyOf(s);
      const names = m.get(k);
      if (names) names.push(s.username);
      else m.set(k, [s.username]);
    }
    return m;
  }, [sources]);

  // the choices the Email domain and Country code filters offer, each with how many contacts it has
  const options = useMemo(() => {
    const domains = new Map<string, number>();
    const codes = new Map<string, number>();
    let personal = 0;
    for (const c of scoped) {
      const f = facets.get(keyOf(c));
      if (f?.domain) {
        domains.set(f.domain, (domains.get(f.domain) ?? 0) + 1);
        if (f.personal) personal++;
      }
      if (f?.code) codes.set(f.code, (codes.get(f.code) ?? 0) + 1);
    }
    const emails = [...domains.values()].reduce((a, b) => a + b, 0);
    // most contacts first, then A to Z; unrecognized numbers last
    const byCount = ([a, x]: [string, number], [b, y]: [string, number]) =>
      Number(a === "?") - Number(b === "?") || y - x || (a < b ? -1 : a > b ? 1 : 0);
    return { domains: [...domains].sort(byCount), codes: [...codes].sort(byCount), personal, business: emails - personal };
  }, [scoped, facets]);

  // a domain or code that no longer has contacts (after a delete, or with another user) means that filter is off
  const domainFilter =
    tableFilters.domain.startsWith("d:") && !options.domains.some(([d]) => d === tableFilters.domain.slice(2))
      ? "all"
      : tableFilters.domain;
  const countryFilter =
    tableFilters.country.startsWith("c:") && !options.codes.some(([c]) => c === tableFilters.country.slice(2))
      ? "all"
      : tableFilters.country;

  const filtered = useMemo(
    () =>
      scoped.filter((c) => {
        const k = keyOf(c);
        const f = facets.get(k);
        if (!f) return false;
        if (tableFilters.source !== "all" && (tableFilters.source === "comments") !== sourceOf.has(k)) return false;
        if (tableFilters.link !== "all" && (tableFilters.link === "yes") !== f.link) return false;
        // Email domain keeps only emails, Country code only numbers
        if (domainFilter !== "all") {
          if (!f.domain) return false;
          if (domainFilter === "personal" ? !f.personal : domainFilter === "business" ? f.personal : f.domain !== domainFilter.slice(2)) {
            return false;
          }
        }
        if (countryFilter !== "all" && f.code !== countryFilter.slice(2)) return false;
        if (tableFilters.selection !== "all" && (tableFilters.selection === "selected") !== selected.has(k)) return false;
        return true;
      }),
    [scoped, facets, sourceOf, selected, tableFilters.source, tableFilters.link, tableFilters.selection, domainFilter, countryFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of filtered) c[row.type] = (c[row.type] ?? 0) + 1;
    return c;
  }, [filtered]);

  const { sort, pageSize } = prefs;
  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = filtered.filter(
      (row) => (type === "all" || row.type === type) && (!q || row.value.toLowerCase().includes(q)),
    );
    const sign = sort.dir === "asc" ? 1 : -1;
    const rank = (t: string) => TYPE_RANK.get(t) ?? TYPES.length;
    // The sort is stable, so rows that compare equal keep the database's order (value A to Z). By type, the
    // default, that is the sidebar's order: email first, LinkedIn last.
    return sort.key === "type"
      ? list.sort((a, b) => sign * (rank(a.type) - rank(b.type)))
      : list.sort((a, b) => {
          const x = a.value.toLowerCase();
          const y = b.value.toLowerCase();
          return sign * (x < y ? -1 : x > y ? 1 : 0);
        });
  }, [filtered, type, deferredQuery, sort.key, sort.dir]);

  // Rows per page (Customize; 0 = all). A change to what the table shows (a filter, the search, the sort, the
  // page size) starts again at page 1; a refresh or a delete keeps the page, or the last one if it's gone.
  const pageCount = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const pagingKey = [type, deferredQuery, activeUser, JSON.stringify(tableFilters), sort.key, sort.dir, pageSize].join("\n");
  const page = paging.key === pagingKey ? Math.min(paging.page, pageCount) : 1;
  const pageRows = pageSize ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;

  function goToPage(n: number) {
    setPaging({ key: pagingKey, page: n });
    window.scrollTo({ top: 0 });
  }

  function setFilter(key: keyof Filters, value: string) {
    setTableFilters((prev) => ({ ...prev, [key]: value }));
  }

  // the active filters, shown as removable chips next to the Filters button
  const chips: { key: keyof Filters; label: string }[] = [];
  if (tableFilters.source !== "all") chips.push({ key: "source", label: SOURCE_LABEL[tableFilters.source] });
  if (tableFilters.link !== "all") chips.push({ key: "link", label: LINK_LABEL[tableFilters.link] });
  if (domainFilter !== "all") {
    const label =
      domainFilter === "personal"
        ? "Personal emails"
        : domainFilter === "business"
          ? "Business emails"
          : `@${domainFilter.slice(2)}`;
    chips.push({ key: "domain", label });
  }
  if (countryFilter !== "all") {
    chips.push({ key: "country", label: codeLabel(countryFilter.slice(2), "Unrecognized numbers") });
  }
  if (tableFilters.selection !== "all") chips.push({ key: "selection", label: SELECTION_LABEL[tableFilters.selection] });

  const customized = JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFS);

  // a column header click sorts by it, a second reverses, a third goes back to the default order
  function toggleSort(key: Sort["key"]) {
    const s = getPrefs().sort;
    updatePrefs({ sort: s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : DEFAULT_SORT });
  }

  const ariaSort = (key: Sort["key"]): "ascending" | "descending" | "none" =>
    sort.key !== key ? "none" : sort.dir === "asc" ? "ascending" : "descending";

  function flash(key: string, kind: "copied" | "shared") {
    // one indicator shows at a time, so cancelling the previous timer means a quick
    // second click can't have its check mark cleared early by the first click's timer
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFeedback({ key, kind });
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      setFeedback(null);
    }, 1500);
  }

  async function copy(row: ContactRow) {
    try {
      await navigator.clipboard.writeText(row.value);
      flash(keyOf(row), "copied");
    } catch {
      // clipboard can be blocked (e.g. plain http on another device); the value is still selectable
    }
  }

  async function share(row: ContactRow) {
    const href = hrefFor(row);
    // mailto:/tel: links are not shareable URLs, so those rows share the raw value
    const data: ShareData =
      href && /^https:/.test(href)
        ? { title: "LinkedIn contact", url: href }
        : { title: "LinkedIn contact", text: row.value };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(href && /^https:/.test(href) ? href : row.value);
      }
      flash(keyOf(row), "shared");
    } catch {
      // user closed the share sheet, or clipboard is blocked -> nothing to do
    }
  }

  function csvCell(value: string) {
    const escaped = value.replace(/"/g, '""');
    // The ="..." text-formula wrapper does two jobs: Excel would turn numeric-looking
    // values (phone/WhatsApp numbers) into 9.16E+11 and drop digits, and scraped values
    // starting with = + - @ would otherwise execute as formulas (CSV injection).
    return /^[=+\-@\t\r\d]/.test(value) ? `="${escaped}"` : `"${escaped}"`;
  }

  function downloadCsv(rowsToExport: ContactRow[], filename: string) {
    const lines = ["type,value", ...rowsToExport.map((r) => `${r.type},${csvCell(r.value)}`)];
    // BOM so Excel reads the file as UTF-8; CRLF is what Excel expects
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Selection is a set of type:value keys; intersecting with the live data means rows
  // that disappear from the DB drop out of the selection automatically.
  const selectedRows = useMemo(() => contacts.filter((c) => selected.has(keyOf(c))), [contacts, selected]);
  // the header checkbox works on the rows on screen: all of them, or this page's
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(keyOf(r)));
  const someVisibleSelected = pageRows.some((r) => selected.has(keyOf(r)));

  function toggleRow(row: ContactRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = keyOf(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) pageRows.forEach((r) => next.delete(keyOf(r)));
      else pageRows.forEach((r) => next.add(keyOf(r)));
      return next;
    });
  }

  // the selection can hold rows the current filter or search hides; the dialog says how many
  const visibleKeys = useMemo(() => new Set(rows.map(keyOf)), [rows]);

  function askDelete(rowsToDelete: ContactRow[]) {
    setDeleteError("");
    setToDelete(rowsToDelete);
  }

  function showNotice(text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null;
      setNotice("");
    }, 4000);
  }

  function confirmDelete() {
    const doomed = toDelete;
    if (!doomed) return;
    startDelete(async () => {
      setDeleteError("");
      const done = new Set<string>(); // keys sent in batches that went through
      let deleted = 0;
      let failure = "";
      for (let i = 0; i < doomed.length && !failure; i += DELETE_BATCH) {
        const batch = doomed.slice(i, i + DELETE_BATCH);
        try {
          const result = await deleteContacts(batch.map(({ type, value }) => ({ type, value })));
          if ("error" in result) {
            failure = result.error;
          } else {
            deleted += result.deleted;
            batch.forEach((r) => done.add(keyOf(r)));
          }
        } catch {
          failure = "The request didn't go through. Reload the page and try again.";
        }
      }
      // updates after an await need a transition of their own, so they show together with the refreshed table
      startDelete(() => {
        if (done.size) {
          setSelected((prev) => new Set([...prev].filter((k) => !done.has(k))));
          showNotice(`Deleted ${deleted} contact${deleted === 1 ? "" : "s"}.`);
        }
        if (failure) setDeleteError(done.size ? `${deleted} deleted, the rest weren't. ${failure}` : failure);
        else setToDelete(null);
      });
    });
  }

  const filters = [
    { key: "all", label: "All", icon: "all" as const, count: filtered.length },
    ...TYPES.map((t) => ({ ...t, count: counts[t.key] ?? 0 })),
  ];

  // rendered twice (desktop aside and mobile drawer)
  const sidebar = () => (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <div className="text-base font-semibold tracking-tight">LinkedIn Contacts</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">linkedin-2.0 scraper feed</div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 lg:hidden dark:hover:bg-zinc-800"
          aria-label="Close sidebar"
        >
          <Icon name="x" />
        </button>
      </div>

      <div className="px-3 pb-4">
        <Link
          href="/comments"
          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">User comments</span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
              Every comment a LinkedIn account wrote
            </span>
          </span>
        </Link>
      </div>

      <nav className="px-3" aria-label="Contact type filter">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Filters
        </div>
        <ul className="space-y-1">
          {filters.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => {
                  setType(f.key);
                  setSidebarOpen(false);
                }}
                aria-current={type === f.key ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  type === f.key
                    ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                }`}
              >
                <Icon name={f.icon} />
                <span className="flex-1 text-left">{f.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    type === f.key
                      ? "bg-white/20 dark:bg-zinc-900/10"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:hover:border-zinc-500"
          >
            <Icon name="refresh" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Loading..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg border border-zinc-200 p-2 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
            aria-label="Toggle dark/light mode"
          >
            {/* CSS decides which icon shows, so the toggle never mismatches on hydration */}
            <span className="dark:hidden">
              <Icon name="moon" />
            </span>
            <span className="hidden dark:inline">
              <Icon name="sun" />
            </span>
          </button>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 px-1 text-xs text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
          />
          Auto refresh (every 30s)
        </label>
      </div>
    </div>
  );

  // above the table: the Filters and Customize buttons, the active filters, and the open panel
  const tableControls = (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPanel((p) => (p === "filters" ? null : "filters"))}
          aria-expanded={panel === "filters"}
          aria-controls="filters-panel"
          className={`${TOOL_BTN} ${panel === "filters" ? TOOL_OPEN : TOOL_IDLE}`}
        >
          <Icon name="filter" />
          Filters
          {chips.length > 0 && (
            <span className="rounded-full bg-zinc-900 px-1.5 text-[11px] leading-5 text-white tabular-nums dark:bg-zinc-100 dark:text-zinc-900">
              {chips.length}
            </span>
          )}
        </button>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <span className="truncate">{chip.label}</span>
            <button
              type="button"
              onClick={() => setFilter(chip.key, "all")}
              aria-label={`Remove filter: ${chip.label}`}
              title="Remove filter"
              className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button
            type="button"
            onClick={() => setTableFilters(NO_FILTERS)}
            className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Clear all
          </button>
        )}
        <button
          type="button"
          onClick={() => setPanel((p) => (p === "customize" ? null : "customize"))}
          aria-expanded={panel === "customize"}
          aria-controls="customize-panel"
          className={`ml-auto ${TOOL_BTN} ${panel === "customize" ? TOOL_OPEN : TOOL_IDLE}`}
        >
          <Icon name="sliders" />
          Customize
          {customized && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
              <span className="sr-only">(changed from the default)</span>
            </>
          )}
        </button>
      </div>

      {panel === "filters" && (
        <div
          id="filters-panel"
          className="mb-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <LabeledSelect
              id="filter-source"
              label="Source"
              value={tableFilters.source}
              onChange={(v) => setFilter("source", v)}
            >
              <SelectItem value="all">Any source</SelectItem>
              <SelectItem value="comments">User comments lookups</SelectItem>
              <SelectItem value="scraper">Scraper runs only</SelectItem>
            </LabeledSelect>
            <LabeledSelect id="filter-link" label="Link" value={tableFilters.link} onChange={(v) => setFilter("link", v)}>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="yes">Has a link (Open works)</SelectItem>
              <SelectItem value="no">No link</SelectItem>
            </LabeledSelect>
            <LabeledSelect
              id="filter-domain"
              label="Email domain"
              value={domainFilter}
              onChange={(v) => setFilter("domain", v)}
              disabled={options.domains.length === 0}
            >
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="personal">Personal providers ({options.personal})</SelectItem>
              <SelectItem value="business">Business domains ({options.business})</SelectItem>
              <SelectSeparator />
              {options.domains.map(([domain, n]) => (
                <SelectItem key={domain} value={`d:${domain}`}>
                  {domain} ({n})
                </SelectItem>
              ))}
            </LabeledSelect>
            <LabeledSelect
              id="filter-country"
              label="Country code"
              value={countryFilter}
              onChange={(v) => setFilter("country", v)}
              disabled={options.codes.length === 0}
            >
              <SelectItem value="all">Any</SelectItem>
              {options.codes.map(([code, n]) => (
                <SelectItem key={code} value={`c:${code}`}>
                  {codeLabel(code, "Unrecognized")} ({n})
                </SelectItem>
              ))}
            </LabeledSelect>
            <LabeledSelect
              id="filter-selection"
              label="Selection"
              value={tableFilters.selection}
              onChange={(v) => setFilter("selection", v)}
            >
              <SelectItem value="all">All rows</SelectItem>
              <SelectItem value="selected">Selected only ({selectedRows.length})</SelectItem>
              <SelectItem value="unselected">Not selected</SelectItem>
            </LabeledSelect>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Email domain keeps only emails, Country code only phone and WhatsApp numbers.
            </p>
            <button
              type="button"
              onClick={() => setTableFilters(NO_FILTERS)}
              disabled={chips.length === 0}
              className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-all hover:border-zinc-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-500"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {panel === "customize" && (
        <div
          id="customize-panel"
          className="mb-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <fieldset className="min-w-0">
              <legend className={FIELD_LABEL}>Columns</legend>
              <div className="flex flex-wrap gap-1.5">
                {COLUMN_OPTIONS.map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-zinc-400 has-checked:border-zinc-900 has-checked:bg-zinc-50 has-focus-visible:ring-2 has-focus-visible:ring-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500 dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={prefs.cols[col.key]}
                      onChange={(e) => updatePrefs({ cols: { ...getPrefs().cols, [col.key]: e.target.checked } })}
                      className="h-3.5 w-3.5 accent-zinc-900 outline-none dark:accent-zinc-100"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="min-w-0">
              <legend className={FIELD_LABEL}>Row density</legend>
              <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                {(["comfortable", "compact"] as const).map((density) => (
                  <label key={density} className="cursor-pointer">
                    <input
                      type="radio"
                      name="density"
                      value={density}
                      checked={prefs.density === density}
                      onChange={() => updatePrefs({ density })}
                      className="peer sr-only"
                    />
                    <span className="block rounded-md px-3 py-1 text-xs font-medium text-zinc-600 transition-colors peer-checked:bg-zinc-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 dark:text-zinc-300 dark:peer-checked:bg-zinc-100 dark:peer-checked:text-zinc-900">
                      {density === "comfortable" ? "Comfortable" : "Compact"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <LabeledSelect
              id="page-size"
              label="Rows per page"
              value={String(pageSize)}
              onChange={(v) => updatePrefs({ pageSize: Number(v) })}
            >
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n ? `${n} rows` : "All rows"}
                </SelectItem>
              ))}
            </LabeledSelect>
            <LabeledSelect
              id="sort-by"
              label="Sort by"
              value={`${sort.key}:${sort.dir}`}
              onChange={(v) => {
                const [key, dir] = v.split(":");
                updatePrefs({ sort: { key: key === "value" ? "value" : "type", dir: dir === "desc" ? "desc" : "asc" } });
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </LabeledSelect>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={prefs.wrap}
                onChange={(e) => updatePrefs({ wrap: e.target.checked })}
                className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
              />
              Wrap long values (off: one line each)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Saved in this browser</span>
              <button
                type="button"
                onClick={() => savePrefs(DEFAULT_PREFS)}
                disabled={!customized}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-all hover:border-zinc-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-500"
              >
                <Icon name="reset" className="h-3.5 w-3.5" />
                Reset to default
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const pager = pageSize > 0 && rows.length > 0 && (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="tabular-nums">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={`${ACTION_BTN} ${ACTION_IDLE} disabled:pointer-events-none disabled:opacity-40`}
        >
          <Icon name="chevronLeft" />
        </button>
        <span className="tabular-nums">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={`${ACTION_BTN} ${ACTION_IDLE} disabled:pointer-events-none disabled:opacity-40`}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
    </div>
  );

  // a sortable column header: the arrow shows the current order
  const sortButton = (key: Sort["key"], label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      title={`Sort by ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1 font-medium tracking-wide uppercase transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      {label}
      <Icon
        name={sort.key !== key ? "chevronsUpDown" : sort.dir === "asc" ? "chevronUp" : "chevronDown"}
        className={`h-3.5 w-3.5 ${sort.key === key ? "" : "opacity-40"}`}
      />
    </button>
  );

  const cellY = prefs.density === "compact" ? "py-1.5" : "py-3";
  const headY = prefs.density === "compact" ? "py-2" : "py-3";

  return (
    <div className="flex min-h-dvh w-full">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-zinc-200 bg-white lg:block dark:border-zinc-800 dark:bg-zinc-950">
        {sidebar()}
      </aside>

      {/* mobile drawer: inert while closed so its off-screen controls can't take focus */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="mobile-sidebar"
        ref={drawerRef}
        tabIndex={-1}
        inert={!sidebarOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-zinc-200 bg-white outline-none transition-transform lg:hidden dark:border-zinc-800 dark:bg-zinc-950 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar()}
      </aside>

      <main className="min-w-0 flex-1">
        {/* search sticks to the top with the table right under it */}
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/85">
          <div className="flex items-center gap-3">
            <button
              type="button"
              ref={menuBtnRef}
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-zinc-200 p-2 lg:hidden dark:border-zinc-700"
              aria-label="Open sidebar"
              aria-expanded={sidebarOpen}
              aria-controls="mobile-sidebar"
            >
              <Icon name="menu" />
            </button>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                <Icon name="search" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by email, number, username..."
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-500"
              />
            </div>
            {/* an item's value can't be "" (Radix), so "all" stands for no filter and usernames get a "u:"
                prefix (there can be an account literally called "all") */}
            <Select
              value={activeUser ? `u:${activeUser}` : "all"}
              onValueChange={(v) => setUser(v === "all" ? "" : v.slice(2))}
              disabled={users.size === 0}
            >
              <SelectTrigger
                id="user-filter"
                aria-label="Filter by user"
                title={
                  users.size
                    ? "Filter by user: contacts found in that account's comments (User comments, Only contacts)."
                    : "Filter by user: accounts show up here after an Only contacts lookup on User comments."
                }
                className="w-36 shrink-0 sm:w-64"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contacts</SelectItem>
                {/* already in order (page.tsx reads them ORDER BY username), so server and browser render the same */}
                {[...users].map(([name, keys]) => (
                  <SelectItem key={name} value={`u:${name}`}>
                    {name} ({keys.size})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => downloadCsv(rows, activeUser ? `contacts_${activeUser}.csv` : "contacts.csv")}
              disabled={rows.length === 0}
              className="hidden items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:border-zinc-400 disabled:opacity-50 sm:flex dark:border-zinc-700 dark:hover:border-zinc-500"
              title="Download the filtered rows as CSV"
            >
              <Icon name="download" />
              CSV
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex min-w-0 items-center gap-1.5 tabular-nums">
              <span className="shrink-0 whitespace-nowrap">
                {rows.length} / {contacts.length} contacts
              </span>
              {activeUser && (
                <>
                  <span className="truncate">
                    · from <span className="font-medium text-zinc-700 dark:text-zinc-200">{activeUser}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUser("")}
                    className="rounded p-0.5 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    aria-label="Show all contacts"
                    title="Show all contacts"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </span>
            {updatedAt && (
              <span className="shrink-0 whitespace-nowrap tabular-nums">Updated {updatedAt.toLocaleTimeString()}</span>
            )}
          </div>
          {selectedRows.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              {/* on phones the count gets a line of its own, so the three buttons fit on the next one */}
              <span className="w-full text-xs font-medium tabular-nums sm:w-auto sm:flex-1">
                {selectedRows.length} selected
              </span>
              <button
                type="button"
                onClick={() => downloadCsv(selectedRows, "contacts-selected.csv")}
                className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition-all hover:bg-zinc-700 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                <Icon name="download" className="h-3.5 w-3.5" />
                Download selected
              </button>
              <button
                type="button"
                onClick={() => askDelete(selectedRows)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-all hover:border-red-400 hover:bg-red-50 active:scale-95 dark:border-red-900 dark:bg-zinc-950 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
                {/* "Delete" on phones, so the three buttons fit on one line there */}
                <span>
                  Delete<span className="sr-only sm:not-sr-only"> selected</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium transition-all hover:border-zinc-400 active:scale-95 dark:border-zinc-700 dark:hover:border-zinc-500"
              >
                Clear
              </button>
            </div>
          )}
          <div aria-live="polite">
            {notice && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                <Icon name="check" className="h-3.5 w-3.5" />
                {notice}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6">
          {contacts.length > 0 && tableControls}
          {contacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No contacts in the database yet. Start a run from the{" "}
              <Link href="/commands" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
                Commands
              </Link>{" "}
              page (or run{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">
                python linkedin_feed.py
              </code>{" "}
              in the linkedin-2 folder) and the data will appear automatically.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className={`w-10 px-3 ${headY}`}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={toggleAllVisible}
                        aria-label="Select all visible rows"
                        className="h-4 w-4 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                      />
                    </th>
                    {prefs.cols.type && (
                      <th aria-sort={ariaSort("type")} className={`hidden px-4 font-medium sm:table-cell ${headY}`}>
                        {sortButton("type", "Type")}
                      </th>
                    )}
                    <th aria-sort={ariaSort("value")} className={`px-4 font-medium ${headY}`}>
                      {sortButton("value", "Contact")}
                    </th>
                    {prefs.cols.source && (
                      <th className={`hidden px-4 font-medium sm:table-cell ${headY}`}>Source</th>
                    )}
                    {prefs.cols.details && (
                      <th className={`hidden px-4 font-medium sm:table-cell ${headY}`}>Details</th>
                    )}
                    {/* a little less padding on phones, where four buttons leave the contact column little room */}
                    {prefs.cols.actions && (
                      <th className={`px-2 text-right font-medium sm:px-4 ${headY}`}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {pageRows.map((row) => {
                    const key = keyOf(row);
                    const href = hrefFor(row);
                    const facet = facets.get(key);
                    const details = prefs.cols.details && facet ? detailsFor(row, facet) : "";
                    const badge = (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[row.type] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
                      >
                        {TYPES.find((t) => t.key === row.type)?.label ?? row.type}
                      </span>
                    );
                    return (
                      <tr
                        key={key}
                        className={`transition-colors ${
                          selected.has(key)
                            ? "bg-zinc-100/80 dark:bg-zinc-800/40"
                            : "bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/60"
                        }`}
                      >
                        <td className={`w-10 px-3 ${cellY}`}>
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggleRow(row)}
                            aria-label={`Select ${row.value}`}
                            className="h-4 w-4 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                          />
                        </td>
                        {prefs.cols.type && (
                          <td className={`hidden px-4 whitespace-nowrap sm:table-cell ${cellY}`}>{badge}</td>
                        )}
                        {/* with wrapping off, w-full + max-w-0 give this column the room the others leave, and the
                            value is cut to fit it */}
                        <td className={`px-4 ${cellY} ${prefs.wrap ? "" : "w-full max-w-0"}`}>
                          {/* on phones the Type column is hidden, so the badge sits above the value */}
                          {prefs.cols.type && <div className="mb-1 sm:hidden">{badge}</div>}
                          {/* break-all sets word-break, which sm:wrap-break-word alone would not undo */}
                          {prefs.wrap ? (
                            <div className="font-mono break-all sm:break-normal sm:wrap-break-word">{row.value}</div>
                          ) : (
                            <div className="truncate font-mono" title={row.value}>
                              {row.value}
                            </div>
                          )}
                          {/* Source and Details are hidden on phones too, so their text sits under the value */}
                          {(prefs.cols.source || details) && (
                            <div className="mt-1 space-y-0.5 text-xs text-zinc-500 sm:hidden dark:text-zinc-400">
                              {prefs.cols.source && (
                                <div className="truncate">{sourceOf.get(key)?.join(", ") ?? "Scraper run"}</div>
                              )}
                              {details && <div className="truncate">{details}</div>}
                            </div>
                          )}
                        </td>
                        {prefs.cols.source && (
                          <td className={`hidden px-4 sm:table-cell ${cellY}`}>
                            <SourceCell names={sourceOf.get(key)} onPick={setUser} />
                          </td>
                        )}
                        {prefs.cols.details && (
                          <td
                            className={`hidden px-4 text-xs whitespace-nowrap text-zinc-600 sm:table-cell dark:text-zinc-300 ${cellY}`}
                          >
                            {details}
                          </td>
                        )}
                        {prefs.cols.actions && (
                          <td className={`px-2 whitespace-nowrap sm:px-4 ${cellY}`}>
                            <div className="flex items-center justify-end gap-1.5">
                              {href && (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open"
                                  aria-label={`Open ${row.value}`}
                                  className={`${ACTION_BTN} ${ACTION_IDLE}`}
                                >
                                  <Icon name="external" className="h-4 w-4" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => copy(row)}
                                title={feedback?.key === key && feedback.kind === "copied" ? "Copied!" : "Copy"}
                                aria-label={`Copy ${row.value}`}
                                className={`${ACTION_BTN} ${
                                  feedback?.key === key && feedback.kind === "copied" ? ACTION_DONE : ACTION_IDLE
                                }`}
                              >
                                {feedback?.key === key && feedback.kind === "copied" ? (
                                  <Icon name="check" className="animate-pop h-4 w-4" />
                                ) : (
                                  <Icon name="copy" className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => share(row)}
                                title={feedback?.key === key && feedback.kind === "shared" ? "Shared!" : "Share"}
                                aria-label={`Share ${row.value}`}
                                className={`${ACTION_BTN} ${
                                  feedback?.key === key && feedback.kind === "shared" ? ACTION_DONE : ACTION_IDLE
                                }`}
                              >
                                {feedback?.key === key && feedback.kind === "shared" ? (
                                  <Icon name="check" className="animate-pop h-4 w-4" />
                                ) : (
                                  <Icon name="share" className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => askDelete([row])}
                                title="Delete"
                                aria-label={`Delete ${row.value}`}
                                className={`${ACTION_BTN} ${ACTION_DANGER}`}
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No contacts match this filter or search.
                  {chips.length > 0 && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => setTableFilters(NO_FILTERS)}
                        className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          )}
          {contacts.length > 0 && pager}
        </div>
      </main>

      {toDelete && (
        <DeleteDialog
          rows={toDelete}
          hidden={toDelete.filter((r) => !visibleKeys.has(keyOf(r))).length}
          deleting={isDeleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            setToDelete(null);
            setDeleteError("");
          }}
        />
      )}
    </div>
  );
}
