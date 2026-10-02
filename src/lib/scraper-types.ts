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
  kind: "scrape" | "session_import" | "session_check" | "comments";
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
};

export type ScraperStatus = { busy: boolean; current: Run | null; last: Run | null };

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
