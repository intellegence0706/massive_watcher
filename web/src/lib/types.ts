// Shapes of the files written by the Python watcher (mwatch) in ../data.

export type Verdict =
  | "OFFICIAL"
  | "LIKELY_OFFICIAL"
  | "OFFICIAL_TRACED"
  | "TEAM_LAUNCH"
  | "COPYCAT"
  | "IGNORED";

export interface PathHop {
  address: string;
  depth?: number;
  funding_sig?: string | null;
  reason?: string;
}

export interface ProofRecordBase {
  kind: string;
  logged_at_utc: string;
  prev: string;
  hash: string;
}

export interface DetectionRecord extends ProofRecordBase {
  kind: "DETECTION";
  verdict: Verdict;
  slot: number;
  signature: string;
  mint: string;
  name: string;
  symbol: string;
  uri?: string;
  creator: string;
  funding_path: PathHop[];
  reason: string;
  seen_at_unix: number;
  decided_at_unix: number;
  decision_ms: number;
}

export interface WatchlistAddRecord extends ProofRecordBase {
  kind: "WATCHLIST_ADD";
  slot: number;
  signature: string;
  address: string;
  parent: string;
  depth: number;
  lamports: number;
}

export interface SiteChangeRecord extends ProofRecordBase {
  kind: "SITE_CHANGE";
  changes: string[];
  digest: string;
}

export type ProofRecord = DetectionRecord | WatchlistAddRecord | SiteChangeRecord | ProofRecordBase;

export interface WatchlistEntry {
  depth: number;
  parent: string | null;
  sig: string | null;
  reason: string;
  added_at: number;
}

export interface MonitorStatus {
  pid: number;
  started_at: number;
  updated_at: number;
  ws_connected: boolean;
  rpc_host: string;
  target: string;
  name_patterns: string[];
  watchlist_size: number;
  subscriptions: number;
  last_create_slot: number | null;
  creates: number;
  matches: number;
  wallet_events: number;
  recent_creates?: RecentCreate[];
  launch_rate?: [number, number][]; // [unix minute start, launches seen in that minute]
}

/** One pump.fun launch the live monitor saw (newest first); verdict null = unrelated token. */
export interface RecentCreate {
  slot: number;
  signature: string;
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  seen_at: number;
  verdict: Verdict | null;
}

export interface BacktestLaunch {
  block_time: number;
  slot: number;
  name: string;
  symbol: string;
  uri: string | null;
  mint: string;
  creator: string;
  verdict: Verdict;
  signature: string;
}

export interface Backtest {
  wallet: string;
  generated_at: number;
  name_patterns: string[];
  wallet_depth: number | null;
  transactions: number;
  missing: number;
  launches: BacktestLaunch[];
}

export interface Announcement {
  posted_at: number; // unix seconds, when the official CA was publicly posted
  source: string;
  recorded_at: number;
}

export interface ProofIntegrity {
  ok: boolean;
  records: number;
  brokenAtLine: number | null;
  error: string | null;
}

export interface Snapshot {
  dataDir: string;
  now: number;
  target: string;
  namePatterns: string[];
  status: MonitorStatus | null;
  records: ProofRecord[];
  integrity: ProofIntegrity;
  watchlist: Record<string, WatchlistEntry>;
  backtests: Backtest[];
  announcements: Record<string, Announcement>;
  errors: string[];
}
