// Shapes of the linkedin-2 scraper API (api.py), shared by server and client code.

export type FieldName = "scrolls" | "commented_posts" | "author_posts" | "author_comments";

export type CommandField = {
  name: FieldName;
  flag: string;
  default: number;
  label: string;
  help: string;
};

export type Command = {
  id: string;
  group: string;
  title: string;
  description: string;
  values: Record<FieldName, number>;
  editable: FieldName[];
  cli: string;
};

export type CommandsResponse = { fields: CommandField[]; commands: Command[]; max_value: number };

export type RunStatus = "running" | "succeeded" | "failed" | "stopped" | "interrupted";

export type Run = {
  id: string;
  kind: "scrape" | "session_import" | "session_check" | "comments" | "authors";
  title: string;
  command_id: string | null;
  values: Record<FieldName, number> | null;
  command: string | null;
  status: RunStatus;
  started_at: number;
  ended_at: number | null;
  exit_code: number | null;
  new_contacts: number;
  db_total: number | null;
  login_required: boolean;
  phase: string | null;
  progress: string | null;
  recent_contacts: { type: string; value: string }[];
  log_lines: number;
  // "comments" runs (linkedin_comments.py) only
  profile?: string;
  username?: string;
  limit?: number | null; // null: no limit (Unlimited)
  passes?: number;
  contacts_only?: boolean; // only the contact details in the comments
  comments_found?: number; // comments read
  contacts_found?: number; // contacts_only runs: contacts found
  posts_found?: number; // contacts_only runs: posts of the account read (missing from an older API)
  // "authors" runs (linkedin_authors.py), with comments_found and contacts_found above
  authors_found?: number; // authors of the posts the account commented on
  profiles_read?: number; // of those, the profiles opened so far
};

export type ScraperStatus = { busy: boolean; current: Run | null; last: Run | null };

// The LinkedIn login on the scraper's machine (api.py GET /api/session)
export type SessionStatus = {
  browser: "waterfox" | "chrome"; // the browser the runs use there
  session: boolean; // its profile has a LinkedIn login cookie that hasn't expired
  expires: string | null; // when that cookie expires (ISO time)
  last_check: Run | null; // the newest login job (session import or check), with its result
};

// The Geonode proxy on the scraper's machine (api.py GET /api/proxy)
export type ProxyStatus = {
  configured: boolean; // GEONODE_* in its .env
  host?: string;
  port?: number;
  country?: string | null;
  // ok: connections go through; limit: the account's data has run out; login: Geonode refused the login
  status?: "ok" | "limit" | "login" | "error" | "unreachable";
  answer?: string; // Geonode's own answer (or why the settings can't be used)
  usage?: ProxyUsage | null; // from Geonode's API, when the API can read it
  usage_note?: string | null; // why there is no usage
  checked_at: number;
};

export type ProxyUsage = {
  used_gb: number | null;
  limit_gb: number | null; // the plan's data
  left_gb: number | null;
  expires: string | null; // when the plan ends (ISO time)
};

export type RunLog = { run: Run; lines: string[]; next: number };

export type ContactType = "email" | "phone" | "whatsapp" | "telegram" | "linkedin";

// One comment as linkedin_comments.py saves it
export type UserComment = {
  id: string; // urn:li:comment:(activity:<post id>,<comment id>)
  text: string;
  date: string | null; // ISO time, from the comment id
  time: string; // as LinkedIn showed it, e.g. "5d"
  url: string | null;
  reply_to: { author: string; text: string } | null;
  post: { urn: string | null; url: string | null; author: string; author_url: string | null; text: string };
  contacts?: { type: ContactType; value: string }[]; // contacts mode only
};

// A contact a lookup found (contacts mode), and where: in how many of the account's comments (and the newest of
// them), in the profile's About section, in how many of the account's posts (and the newest of them)
export type CommentContact = {
  type: ContactType;
  value: string;
  comment_id: string | null;
  count: number;
  about?: boolean;
  posts?: number;
  post?: string | null; // its urn
};

// One of the account's posts that has contact details (contacts mode): each contact once, with the text it is in
// (the post itself, or the first comment on it that has it)
export type ContactPost = {
  urn: string;
  url: string;
  date: string | null;
  text: string;
  comments: number; // comments read on it
  contacts: { type: ContactType; value: string; comment: boolean; author: string; text: string }[];
};

export type CommentsResult = {
  username: string;
  profile: string;
  name: string | null;
  limit: number | null; // null: no limit
  passes: number;
  mode?: "all" | "contacts"; // missing in files from before the contacts mode: "all"
  complete: boolean;
  reached_end: boolean;
  updated_at: string | null;
  comments_read?: number; // comments read; in contacts mode `comments` keeps only the ones with contacts
  comments: UserComment[];
  contacts?: CommentContact[]; // contacts mode only
  // contacts mode, from a scraper that also reads the About section and the account's posts
  about?: { text: string; contacts: { type: ContactType; value: string }[] } | null; // null: not read yet
  posts_read?: number; // fewer than posts_total at the end: some posts didn't open
  posts_total?: number | null; // the posts the account has (all of them are read); null: not listed yet
  posts?: ContactPost[];
};

export type CommentsResponse = { run: Run; result: CommentsResult | null };

// Where one of the account's comments is: its link and the link of the post it is on (as User comments' Open
// comment and Open post), and when it was written
export type AuthorLink = { id: string; post_url: string | null; comment_url: string | null; date: string | null };

// One author of the posts an account commented on, as linkedin_authors.py saves it
export type AuthorEntry = {
  name: string;
  profile: string; // https://www.linkedin.com/in/<name>/ (or /company/... for a page)
  kind: "person" | "company";
  posts: number; // how many of the account's commented posts this author wrote
  post_url: string | null; // the newest of them
  // waiting: not opened yet; read: About read; not_found: no such profile; failed: didn't load;
  // company: a company page, listed but not opened
  status: "waiting" | "read" | "not_found" | "failed" | "company";
  about: string;
  // from the About section and Contact info, or else from one of the author's posts; each once, with where it was
  // found (missing in older files: About)
  contacts: { type: ContactType; value: string; found_in?: ("about" | "contact_info" | "post")[] }[];
  // the links to the account's comments on this author's posts, newest first (files from a short-lived version
  // kept each comment whole: UserComment; the oldest files: none)
  comments?: (AuthorLink | UserComment)[];
  contact_info?: "read" | "none" | "failed" | null; // none: LinkedIn didn't show it; null: not opened
  // only when the About section and Contact info had no contacts: the author's newest posts found and how many of
  // them were read (until one had contact details), and the post the contacts are from; null: not looked in
  own_posts_found?: number | null;
  own_posts_read?: number | null;
  contact_post?: string | null;
  posts_note?: string; // why their posts didn't load
  note?: string; // why it failed
};

export type AuthorsResult = {
  username: string;
  profile: string;
  name: string | null;
  limit: number | null; // null: no limit
  passes: number;
  mode: "authors";
  complete: boolean;
  reached_end: boolean;
  updated_at: string | null;
  comments_read: number;
  posts: number | null; // the posts the comments are on (by others); null: not known yet
  authors: AuthorEntry[];
  profiles_total: number | null; // the people among the authors, whose profiles are opened
  profiles_read: number;
  contacts: { type: ContactType; value: string; authors: string[] }[];
};

export type AuthorsResponse = { run: Run; result: AuthorsResult | null };
