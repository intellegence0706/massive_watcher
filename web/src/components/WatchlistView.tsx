"use client";

import { IconActivity, IconShield, IconTree, IconWallet } from "./icons";
import { Address, Empty, Panel, Stat } from "./ui";
import { fmtTime } from "@/lib/format";
import type { WatchlistEntry } from "@/lib/types";

type Node = { address: string; entry: WatchlistEntry; children: Node[] };

function buildTree(wl: Record<string, WatchlistEntry>): Node[] {
  const nodes = new Map<string, Node>();
  for (const [address, entry] of Object.entries(wl)) nodes.set(address, { address, entry, children: [] });
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const parent = n.entry.parent ? nodes.get(n.entry.parent) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  // Anchors keep config order (treasury first); funded wallets are listed in funding order.
  const sortChildren = (list: Node[]) => {
    list.sort((a, b) => (whenOf(a.entry.reason) ?? "").localeCompare(whenOf(b.entry.reason) ?? "") || a.entry.added_at - b.entry.added_at);
    list.forEach((n) => sortChildren(n.children));
  };
  roots.forEach((r) => sortChildren(r.children));
  return roots;
}

// The watcher records the funded amount in the reason text ("… 51.528 SOL …").
function solOf(reason: string) {
  const m = /([\d.]+) SOL/.exec(reason);
  return m ? Number(m[1]) : null;
}
// …and the funding time ("at 2026-09-16 09:45:22").
function whenOf(reason: string) {
  return /at (\d{4}-\d\d-\d\d \d\d:\d\d)/.exec(reason)?.[1] ?? null;
}

function Children({ nodes }: { nodes: Node[] }) {
  return (
    <ul className="ml-[22px] border-l border-line-strong/70">
      {nodes.map((n) => {
        const sol = solOf(n.entry.reason);
        const when = whenOf(n.entry.reason);
        return (
          <li key={n.address} className="relative py-1 pl-5">
            <span className="absolute left-0 top-1/2 h-px w-4 bg-line-strong/70" aria-hidden />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-1.5 hover:bg-panel-2">
              <span className="grid size-6 place-items-center rounded-lg bg-panel-2 text-muted"><IconWallet width={13} height={13} /></span>
              <Address value={n.address} n={6} />
              {sol !== null && (
                <span className={`tabular rounded-md px-1.5 py-0.5 text-xs font-medium ${sol >= 10 ? "bg-warn-bg text-warn-ink" : "bg-neutral-bg text-muted"}`}>
                  {sol.toLocaleString("en-US", { maximumFractionDigits: 3 })} SOL
                </span>
              )}
              <span className="text-xs text-muted">
                {when ? `funded ${when} UTC` : n.entry.reason}
              </span>
              {n.entry.sig && <span className="ml-auto text-xs text-muted"><Address value={n.entry.sig} kind="tx" /></span>}
            </div>
            {n.children.length > 0 && <Children nodes={n.children} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function WatchlistView({ watchlist }: { watchlist: Record<string, WatchlistEntry> }) {
  const roots = buildTree(watchlist);
  const entries = Object.values(watchlist);
  const anchors = entries.filter((e) => e.depth === 0).length;
  const funded = entries.length - anchors;
  const totalSol = entries.reduce((a, e) => a + (solOf(e.reason) ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Wallets watched" value={entries.length} icon={<IconTree width={14} height={14} />} tone="accent" />
        <Stat label="Verified anchors" value={anchors} icon={<IconShield width={14} height={14} />} tone="ok" />
        <Stat label="Funded by anchors" value={funded} hint="fresh wallets, first tx from an anchor" icon={<IconWallet width={14} height={14} />} />
        <Stat label="SOL sent to them" value={totalSol.toLocaleString("en-US", { maximumFractionDigits: 1 })} hint="total initial funding" icon={<IconActivity width={14} height={14} />} />
      </div>

      <Panel title="Funding tree" icon={<IconTree width={14} height={14} />}>
        <p className="border-b border-line px-4 py-3 text-sm text-muted">
          Anchors are wallets verified to belong to the project. Any brand-new wallet they fund is added beneath them.
          A token created by any wallet here is linked to the project. A copycat can copy the name, never the creator.
        </p>
        {entries.length === 0 ? (
          <Empty icon={<IconTree width={18} height={18} />}>Watchlist is empty. Start the watcher; it seeds the anchors from config.json.</Empty>
        ) : (
          <div className="space-y-4 p-4">
            {roots.map((r) => (
              <div key={r.address} className="rounded-2xl border border-line bg-panel-solid/60 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="grid size-8 place-items-center rounded-xl bg-ok-bg text-ok-ink ring-1 ring-inset ring-ok/25">
                    <IconShield width={15} height={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-ok-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ok-ink">anchor</span>
                      <Address value={r.address} n={6} />
                      {r.children.length > 0 && <span className="text-xs text-muted">funded {r.children.length} wallet{r.children.length === 1 ? "" : "s"}</span>}
                    </div>
                    <div className="mt-0.5 text-sm text-muted">{r.entry.reason}</div>
                  </div>
                  <span className="ml-auto text-xs text-muted">since {fmtTime(r.entry.added_at)}</span>
                </div>
                {r.children.length > 0 && (
                  <div className="mt-2">
                    <Children nodes={r.children} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
