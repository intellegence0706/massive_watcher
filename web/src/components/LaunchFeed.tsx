"use client";

import { useState } from "react";

import { IconActivity } from "./icons";
import { Address, Empty, Panel, TokenAvatar, VerdictBadge } from "./ui";
import { fmtAgo, num } from "@/lib/format";
import type { RecentCreate } from "@/lib/types";

/** The last launches the monitor actually saw on pump.fun, as proof the stream is live. */
export default function LaunchFeed({ items, now, live }: { items: RecentCreate[]; now: number; live: boolean }) {
  // Rows that weren't in the previous poll flash briefly so new launches are noticeable
  // (React's "store information from previous renders" pattern).
  const [prevItems, setPrevItems] = useState<RecentCreate[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  if (items !== prevItems) {
    const before = new Set((prevItems ?? []).map((c) => c.signature));
    setFresh(prevItems === null ? new Set() : new Set(items.filter((c) => !before.has(c.signature)).map((c) => c.signature)));
    setPrevItems(items);
  }

  return (
    <Panel
      title="Live pump.fun launches"
      icon={<IconActivity width={14} height={14} />}
      right={
        <span className="flex items-center gap-2 text-xs text-muted">
          {live && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-ok" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
          )}
          last {items.length} seen · each checked against the watchlist
        </span>
      }
    >
      {items.length === 0 ? (
        <Empty icon={<IconActivity width={18} height={18} />}>
          {live ? "Connected; waiting for the next launch on pump.fun…" : "Start the monitor to stream live launches here."}
        </Empty>
      ) : (
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] border-b border-line bg-panel-solid">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-medium">Token</th>
                <th className="px-3 py-2.5 font-medium">Mint</th>
                <th className="px-3 py-2.5 font-medium">Creator</th>
                <th className="px-3 py-2.5 text-right font-medium">Slot</th>
                <th className="px-3 py-2.5 font-medium">Seen</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.signature}
                  className={`border-b border-line/70 last:border-0 ${fresh.has(c.signature) ? "animate-row-in" : ""} ${c.verdict ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
                >
                  <td className="max-w-64 px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <TokenAvatar name={c.name} mint={c.mint} size={26} />
                      <div className="min-w-0">
                        <div className="truncate font-medium" title={c.name}>{c.name}</div>
                        <div className="truncate text-xs text-muted">${c.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2"><Address value={c.mint} kind="mint" /></td>
                  <td className="px-3 py-2"><Address value={c.creator} /></td>
                  <td className="tabular px-3 py-2 text-right text-xs text-muted">{num(c.slot)}</td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtAgo(now - c.seen_at)}</td>
                  <td className="px-4 py-2">
                    {c.verdict ? <VerdictBadge verdict={c.verdict} /> : <span className="text-xs text-muted/80">not related</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
