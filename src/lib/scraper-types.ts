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
  contacts_found?: number; // contacts_only runs: contacts found in them
};

export type ScraperStatus = { busy: boolean; current: Run | null; last: Run | null };

export type RunLog = { run: Run; lines: string[]; next: number };

export type ContactType = "email" | "phone" | "whatsapp" | "telegram";

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

// A contact found in the comments (contacts mode): from the newest comment that has it, and in how many
export type CommentContact = { type: ContactType; value: string; comment_id: string; count: number };

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
};

export type CommentsResponse = { run: Run; result: CommentsResult | null };
