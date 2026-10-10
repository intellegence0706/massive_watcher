"use client";

import { useState } from "react";

import { IconChain, IconShield } from "./icons";
import { Empty, Panel, VerdictBadge } from "./ui";
import type { DetectionRecord, ProofIntegrity, ProofRecord, SiteChangeRecord, WatchlistAddRecord } from "@/lib/types";

function summary(r: ProofRecord) {
  switch (r.kind) {
    case "DETECTION": {
      const d = r as DetectionRecord;
      return (
        <span className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={d.verdict} />
          <span className="font-medium">{d.name}</span>
          <span className="text-muted">${d.symbol} · slot {d.slot.toLocaleString("en-US")}</span>
        </span>
      );
    }
    case "WATCHLIST_ADD": {
      const w = r as WatchlistAddRecord;
      return (
        <span>
          <span className="font-mono text-[12.5px]">{w.address.slice(0, 8)}…</span> added at depth {w.depth}
          <span className="text-muted"> · {(w.lamports / 1e9).toFixed(3)} SOL from {w.parent.slice(0, 8)}…</span>
        </span>
      );
    }
    case "SITE_CHANGE":
      return (r as SiteChangeRecord).changes.join(" · ");
    default:
      return r.kind;
  }
}

const KIND_STYLE: Record<string, string> = {
  DETECTION: "bg-accent text-white",
  WATCHLIST_ADD: "bg-info text-white",
  SITE_CHANGE: "bg-warn text-white",
};

export function IntegrityBanner({ integrity }: { integrity: ProofIntegrity }) {
  const ok = integrity.ok;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm ${ok ? "border-ok/30 bg-ok-bg" : "border-bad/30 bg-bad-bg"}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${ok ? "bg-ok text-white" : "bg-bad text-white"}`}>
        <IconShield width={18} height={18} />
      </span>
      <div>
        <div className={`font-semibold ${ok ? "text-ok-ink" : "text-bad-ink"}`}>
          {ok ? `Hash chain intact · ${integrity.records} records verified` : `Hash chain broken at line ${integrity.brokenAtLine}`}
        </div>
        <div className="text-muted">
          {ok ? (
            <>
              Re-checked in this dashboard with the same algorithm as <code className="font-mono">python -m mwatch verify</code>. Editing, deleting or
              reordering any past record breaks the chain.
            </>
          ) : (
            <>{integrity.error}. Records from that line on cannot be trusted as evidence.</>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProofView({ records, integrity }: { records: ProofRecord[]; integrity: ProofIntegrity }) {
  const kinds = [...new Set(records.map((r) => r.kind))];
  const [kind, setKind] = useState<string | null>(null);
  const shown = [...records].reverse().filter((r) => !kind || r.kind === kind);
  return (
    <div className="space-y-4">
      <IntegrityBanner integrity={integrity} />
      <Panel
        title={`Proof log (${records.length})`}
        icon={<IconChain width={14} height={14} />}
        right={
          <div className="flex rounded-xl border border-line bg-panel-2 p-0.5">
            {[null, ...kinds].map((k) => (
              <button
                key={k ?? "all"}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg px-2.5 py-1 text-xs transition ${kind === k ? "bg-panel-solid font-medium shadow-panel" : "text-muted hover:text-fg"}`}
              >
                {k ?? "All"}
              </button>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <Empty icon={<IconChain width={18} height={18} />}>
            No records yet. The live monitor appends every decision to <code className="font-mono">data/proof.jsonl</code>, each one sealed to the previous by its hash.
          </Empty>
        ) : (
          <ol className="relative px-4 py-3">
            <span className="absolute bottom-6 left-[29px] top-6 w-px bg-line-strong" aria-hidden />
            {shown.map((r) => (
              <li key={r.hash} className="relative flex gap-4 py-2">
                <span className={`z-[1] mt-1 grid size-[26px] shrink-0 place-items-center rounded-full text-[10px] font-bold ring-4 ring-panel-solid ${KIND_STYLE[r.kind] ?? "bg-muted text-white"}`}>
                  {r.kind[0]}
                </span>
                <div className="min-w-0 flex-1 rounded-xl border border-line bg-panel-solid/60 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{r.kind.replace("_", " ")}</span>
                    <span className="tabular text-xs text-muted">{r.logged_at_utc.replace("T", " ").slice(0, 19)} UTC</span>
                  </div>
                  <div className="mt-1 text-sm">{summary(r)}</div>
                  <div className="mt-1.5 font-mono text-[11px] text-muted" title={`hash ${r.hash}\nprev ${r.prev}`}>
                    prev {r.prev.slice(0, 10)}… → <span className="text-fg">hash {r.hash.slice(0, 16)}…</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
