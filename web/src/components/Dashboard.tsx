"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { LeadBadge } from "./Announcement";
import BacktestView from "./BacktestView";
import DetectionsView from "./DetectionsView";
import {
  IconActivity, IconBan, IconChain, IconGlobe, IconGrid, IconHistory, IconShield, IconTarget, IconTree, IconWallet,
} from "./icons";
import LaunchFeed from "./LaunchFeed";
import LaunchRateChart from "./LaunchRateChart";
import ProofView, { IntegrityBanner } from "./ProofView";
import { Address, Empty, Panel, Stat, TokenAvatar, VerdictBadge, isOfficial } from "./ui";
import WatchlistView from "./WatchlistView";
import { fmtAgo, fmtDuration, fmtTime, num } from "@/lib/format";
import type { DetectionRecord, Snapshot } from "@/lib/types";

const POLL_MS = 3000;
const STALE_AFTER_S = 20; // the watcher rewrites status.json every 5s

const TABS: { key: string; label: string; icon: ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <IconGrid width={15} height={15} /> },
  { key: "detections", label: "Detections", icon: <IconTarget width={15} height={15} /> },
  { key: "watchlist", label: "Watchlist", icon: <IconTree width={15} height={15} /> },
  { key: "backtest", label: "Backtest", icon: <IconHistory width={15} height={15} /> },
  { key: "proof", label: "Proof log", icon: <IconChain width={15} height={15} /> },
];
type Tab = "overview" | "detections" | "watchlist" | "backtest" | "proof";

function useSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSnap(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // Poll only while the tab is visible; refresh immediately when it becomes visible again.
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      refresh();
      timer = setInterval(refresh, POLL_MS);
    };
    const onVis = () => (document.hidden ? clearInterval(timer) : start());
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  return { snap, error, refresh };
}

function monitorState(snap: Snapshot) {
  const s = snap.status;
  const age = s ? snap.now - s.updated_at : Infinity;
  return !s ? "never" : age > STALE_AFTER_S ? "offline" : s.ws_connected ? "live" : "reconnecting";
}

function StatusCard({ snap }: { snap: Snapshot }) {
  const s = snap.status;
  const state = monitorState(snap);
  const style = {
    live: { dot: "bg-ok", text: "Monitoring live", cls: "text-ok-ink", ping: true },
    reconnecting: { dot: "bg-warn", text: "Reconnecting", cls: "text-warn-ink", ping: true },
    offline: { dot: "bg-bad", text: "Monitor offline", cls: "text-bad-ink", ping: false },
    never: { dot: "bg-muted", text: "Monitor not started", cls: "text-muted", ping: false },
  }[state];
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-panel px-4 py-3 shadow-panel backdrop-blur-xl">
      <span className="relative flex size-3">
        {style.ping && <span className={`absolute inline-flex size-full animate-ping-slow rounded-full ${style.dot}`} />}
        <span className={`relative inline-flex size-3 rounded-full ${style.dot}`} />
      </span>
      <div className="text-sm">
        <div className={`font-semibold ${style.cls}`}>{style.text}</div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted">
          {s ? (
            <>
              <span>heartbeat {fmtAgo(snap.now - s.updated_at)}</span>
              {state !== "offline" && <span>up {fmtDuration(snap.now - s.started_at)}</span>}
              <span className="inline-flex items-center gap-1"><IconGlobe width={11} height={11} />{s.rpc_host.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
            </>
          ) : (
            <span>run <code className="font-mono">python -m mwatch run</code></span>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ snap, detections, go }: { snap: Snapshot; detections: DetectionRecord[]; go: (t: Tab) => void }) {
  const s = snap.status;
  const live = monitorState(snap) === "live";
  const fresh = !!s && snap.now - s.updated_at <= STALE_AFTER_S;
  const official = detections.filter((d) => isOfficial(d.verdict));
  const copycats = detections.filter((d) => d.verdict === "COPYCAT").length;
  const flaggedIn = (b: (typeof snap.backtests)[number]) => b.launches.filter((l) => isOfficial(l.verdict)).length;
  // Headline the backtest with the strongest evidence; all of them are listed in the Backtest tab.
  const bt = [...snap.backtests].sort((a, b) => flaggedIn(b) - flaggedIn(a))[0];
  const btFlagged = bt ? flaggedIn(bt) : 0;
  const recent = [...snap.records].reverse().slice(0, 6);
  const link = (t: Tab, label: string) => (
    <button type="button" onClick={() => go(t)} className="rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-panel-2 hover:text-fg">
      {label} →
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Official detections" value={num(official.length)} tone={official.length ? "ok" : "none"} hint="creator linked to the project" icon={<IconTarget width={14} height={14} />} />
        <Stat label="Copycats rejected" value={num(copycats)} tone={copycats ? "bad" : "none"} hint="name match, no wallet link" icon={<IconBan width={14} height={14} />} />
        <Stat label="Launches scanned" value={num(s?.creates)} tone="accent" hint={s?.last_create_slot ? `last slot ${num(s.last_create_slot)}` : "since monitor start"} icon={<IconActivity width={14} height={14} />} />
        <Stat label="Wallets watched" value={num(Object.keys(snap.watchlist).length)} tone="accent" hint={s ? `${s.subscriptions} live subscriptions` : "anchors + funded wallets"} icon={<IconWallet width={14} height={14} />} />
        <Stat
          label="Proof log"
          value={snap.integrity.ok ? "Intact" : "Broken"}
          tone={snap.integrity.ok ? "ok" : "bad"}
          hint={`${snap.integrity.records} records verified`}
          icon={<IconShield width={14} height={14} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Panel title="Official token detections" icon={<IconTarget width={14} height={14} />} right={link("detections", "All detections")}>
          {official.length === 0 ? (
            <Empty icon={<IconTarget width={18} height={18} />}>
              <div className="font-medium text-fg">Waiting for the launch</div>
              When a watched wallet creates a token named like <b className="text-fg">{snap.namePatterns.join(", ") || "the target"}</b>, it lands here
              within milliseconds, with its funding path back to the project.
            </Empty>
          ) : (
            <ul>
              {[...official].reverse().map((d) => (
                <li key={d.hash} className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <TokenAvatar name={d.name} mint={d.mint} size={34} />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{d.name}</span>
                        <span className="text-xs text-muted">${d.symbol}</span>
                        <VerdictBadge verdict={d.verdict} />
                      </div>
                      <div className="flex flex-wrap items-center text-xs text-muted">
                        <Address value={d.mint} kind="mint" /> · slot {num(d.slot)} · {fmtTime(d.seen_at_unix)} · decided in {d.decision_ms} ms
                      </div>
                    </div>
                  </div>
                  <LeadBadge seenAt={d.seen_at_unix} ann={snap.announcements[d.mint]} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="pump.fun launches per minute" icon={<IconActivity width={14} height={14} />} right={<span className="text-xs text-muted">last 60 min, seen by the monitor</span>}>
          {fresh && s?.launch_rate?.length ? (
            <LaunchRateChart rate={s.launch_rate} now={snap.now} />
          ) : (
            <Empty icon={<IconActivity width={18} height={18} />}>{live ? "Collecting the first minute of data…" : "Start the monitor to chart live launch activity."}</Empty>
          )}
        </Panel>
      </div>

      <LaunchFeed items={fresh ? (s?.recent_creates ?? []) : []} now={snap.now} live={live} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Backtest evidence" icon={<IconHistory width={14} height={14} />} right={bt && link("backtest", "Open")}>
          {!bt ? (
            <Empty>No backtest yet.</Empty>
          ) : (
            <div className="space-y-3 px-4 py-4 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="tabular bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-4xl font-semibold tracking-tight text-transparent">{btFlagged}</span>
                <span className="text-muted">of {bt.launches.length} past launches would have been flagged at creation</span>
              </div>
              <p className="flex flex-wrap items-center text-xs text-muted">
                created by <Address value={bt.wallet} /> · {bt.missing ? `incomplete: ${bt.missing} txs missing` : `all ${bt.transactions} transactions scanned`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bt.launches.filter((l) => isOfficial(l.verdict)).slice(0, 12).map((l) => (
                  <span key={l.signature} className="rounded-lg bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok-ink ring-1 ring-inset ring-ok/20" title={`${l.mint} · ${fmtTime(l.block_time)}`}>
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Recent activity" icon={<IconChain width={14} height={14} />} right={link("proof", "Proof log")}>
          {recent.length === 0 ? (
            <Empty icon={<IconChain width={18} height={18} />}>No decisions recorded yet. Every detection, new wallet and site change is sealed into the proof log.</Empty>
          ) : (
            <ul>
              {recent.map((r) => (
                <li key={r.hash} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 text-sm last:border-0">
                  <span className="rounded-md bg-neutral-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{r.kind.replace("_", " ")}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.kind === "DETECTION"
                      ? `${(r as DetectionRecord).name} ($${(r as DetectionRecord).symbol}) → ${(r as DetectionRecord).verdict}`
                      : r.kind === "WATCHLIST_ADD"
                        ? `new wallet ${(r as { address: string }).address.slice(0, 10)}…`
                        : r.kind === "SITE_CHANGE"
                          ? (r as { changes: string[] }).changes[0]
                          : ""}
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted">{r.logged_at_utc.slice(11, 19)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {!snap.integrity.ok && <IntegrityBanner integrity={snap.integrity} />}
    </div>
  );
}

export default function Dashboard() {
  const { snap, error, refresh } = useSnapshot();
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.key === h)) setTab(h as Tab);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  const detections = (snap?.records.filter((r) => r.kind === "DETECTION") ?? []) as DetectionRecord[];
  const officialCount = detections.filter((d) => isOfficial(d.verdict)).length;
  const counts: Partial<Record<Tab, number>> = snap
    ? { detections: detections.length, watchlist: Object.keys(snap.watchlist).length, proof: snap.records.length }
    : {};

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Launch watch · Solana</div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {snap ? <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">{snap.target}</span> : "…"}
            </h1>
            {snap && snap.namePatterns.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                matching
                {snap.namePatterns.map((p) => (
                  <span key={p} className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] text-fg">{p}</span>
                ))}
                <span>· watch-only</span>
              </div>
            )}
          </div>
        </div>
        {snap && <StatusCard snap={snap} />}
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-bad/30 bg-bad-bg px-4 py-2.5 text-sm text-bad-ink">
          Can&apos;t load data: {error}. Retrying every {POLL_MS / 1000}s.
        </div>
      )}
      {snap?.errors.map((e) => (
        <div key={e} className="mb-2 rounded-xl border border-warn/30 bg-warn-bg px-4 py-2.5 text-sm text-warn-ink">
          {e}
        </div>
      ))}

      <nav className="mb-6 flex w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-panel p-1 shadow-panel backdrop-blur-xl sm:w-fit">
        {TABS.map((t) => {
          const active = tab === t.key;
          const c = counts[t.key as Tab];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key as Tab)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition ${
                active ? "bg-accent font-medium text-white shadow-panel" : "text-muted hover:bg-panel-2 hover:text-fg"
              }`}
            >
              {t.icon}
              {t.label}
              {t.key === "detections" && officialCount > 0 ? (
                <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-ok-bg text-ok-ink"}`}>{officialCount}</span>
              ) : c ? (
                <span className={`tabular rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-panel-2 text-muted"}`}>{c}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {!snap ? (
        <div className="py-24 text-center text-sm text-muted">{error ? "No data." : "Loading…"}</div>
      ) : tab === "overview" ? (
        <Overview snap={snap} detections={detections} go={go} />
      ) : tab === "detections" ? (
        <DetectionsView detections={detections} announcements={snap.announcements} onChange={refresh} />
      ) : tab === "watchlist" ? (
        <WatchlistView watchlist={snap.watchlist} />
      ) : tab === "backtest" ? (
        <BacktestView backtests={snap.backtests} />
      ) : (
        <ProofView records={snap.records} integrity={snap.integrity} />
      )}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          Reading <span className="break-all font-mono">{snap?.dataDir ?? "…"}</span>
        </span>
        <span>refreshes every {POLL_MS / 1000}s · watch-only, nothing is bought</span>
      </footer>
    </div>
  );
}
