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
  kind: "scrape" | "session_import" | "session_check";
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
};

export type ScraperStatus = { busy: boolean; current: Run | null; last: Run | null };

export type RunLog = { run: Run; lines: string[]; next: number };
