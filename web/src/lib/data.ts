import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { verifyProofLog } from "./pyjson";
import type { Announcement, Backtest, MonitorStatus, ProofRecord, Snapshot, WatchlistEntry } from "./types";

// The Python watcher writes into massive_watcher/data; the web app lives in massive_watcher/web.
export const DATA_DIR = process.env.MWATCH_DATA_DIR
  ? path.resolve(process.env.MWATCH_DATA_DIR)
  : path.resolve(process.cwd(), "..", "data");
const CONFIG_PATH = process.env.MWATCH_CONFIG ?? path.resolve(DATA_DIR, "..", "config.json");

const file = (name: string) => path.join(DATA_DIR, name);
export const ANNOUNCEMENTS_PATH = file("announcements.json");

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function readJson<T>(p: string, errors: string[]): Promise<T | null> {
  const text = await readText(p).catch((e) => {
    errors.push(`${path.basename(p)}: ${(e as Error).message}`);
    return null;
  });
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    // The watcher replaces files atomically, so this only happens if a file was hand-edited.
    errors.push(`${path.basename(p)} is not valid JSON`);
    return null;
  }
}

export async function readAnnouncements(): Promise<Record<string, Announcement>> {
  return (await readJson<Record<string, Announcement>>(ANNOUNCEMENTS_PATH, [])) ?? {};
}

export async function writeAnnouncements(data: Record<string, Announcement>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = ANNOUNCEMENTS_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, ANNOUNCEMENTS_PATH);
}

async function readBacktests(errors: string[]): Promise<Backtest[]> {
  const dir = file("backtests");
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") errors.push(`backtests: ${(e as Error).message}`);
  }
  const all = await Promise.all(names.map((n) => readJson<Backtest>(path.join(dir, n), errors)));
  return all.filter((b): b is Backtest => b !== null).sort((a, b) => b.generated_at - a.generated_at);
}

export async function loadSnapshot(): Promise<Snapshot> {
  const errors: string[] = [];
  const [status, watchlist, backtests, announcements, config, proofText] = await Promise.all([
    readJson<MonitorStatus>(file("status.json"), errors),
    readJson<Record<string, WatchlistEntry>>(file("watchlist.json"), errors),
    readBacktests(errors),
    readAnnouncements(),
    readJson<{ target?: string; name_patterns?: string[] }>(CONFIG_PATH, errors),
    readText(file("proof.jsonl")).catch(() => null),
  ]);

  const records: ProofRecord[] = [];
  for (const line of (proofText ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A line being appended right now; integrity check below reports genuinely bad lines.
    }
  }
  const integrity = proofText === null
    ? { ok: true, records: 0, brokenAtLine: null, error: null }
    : verifyProofLog(proofText.endsWith("\n") ? proofText : proofText.slice(0, proofText.lastIndexOf("\n") + 1));

  return {
    dataDir: DATA_DIR,
    now: Date.now() / 1000,
    target: status?.target ?? config?.target ?? "unknown",
    namePatterns: status?.name_patterns ?? config?.name_patterns ?? [],
    status,
    records,
    integrity,
    watchlist: watchlist ?? {},
    backtests,
    announcements,
    errors,
  };
}
