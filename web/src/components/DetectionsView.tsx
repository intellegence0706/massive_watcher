"use client";

import { Fragment, useMemo, useState } from "react";

import { AnnouncementForm, LeadBadge } from "./Announcement";
import FundingPath from "./FundingPath";
import { IconSearch, IconTarget } from "./icons";
import { Address, Empty, Panel, Td, Th, TokenAvatar, VerdictBadge, isOfficial } from "./ui";
import { fmtTime, num } from "@/lib/format";
import type { Announcement, DetectionRecord } from "@/lib/types";

const FILTERS = [
  { key: "official", label: "Official", test: (d: DetectionRecord) => isOfficial(d.verdict) },
  { key: "team", label: "Team · other name", test: (d: DetectionRecord) => d.verdict === "TEAM_LAUNCH" },
  { key: "copycat", label: "Copycats", test: (d: DetectionRecord) => d.verdict === "COPYCAT" },
  { key: "all", label: "All", test: () => true },
] as const;

export default function DetectionsView({ detections, announcements, onChange }: {
  detections: DetectionRecord[];
  announcements: Record<string, Announcement>;
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const needle = q.trim().toLowerCase();
    return [...detections]
      .reverse()
      .filter(f.test)
      .filter((d) => !needle || [d.name, d.symbol, d.mint, d.creator].some((s) => s?.toLowerCase().includes(needle)));
  }, [detections, filter, q]);

  return (
    <Panel
      title={`Detections (${detections.length})`}
      icon={<IconTarget width={14} height={14} />}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-xl border border-line bg-panel-2 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-2.5 py-1 text-xs transition ${filter === f.key ? "bg-panel-solid font-medium text-fg shadow-panel" : "text-muted hover:text-fg"}`}
              >
                {f.label} <span className="tabular text-muted">{detections.filter(f.test).length}</span>
              </button>
            ))}
          </div>
          <label className="flex w-60 items-center gap-2 rounded-xl border border-line bg-panel-2 px-2.5 py-1.5 text-muted focus-within:border-accent">
            <IconSearch width={14} height={14} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, mint, creator"
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
          </label>
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty icon={<IconTarget width={18} height={18} />}>
          {detections.length === 0
            ? "No detections yet. They appear here the moment the live monitor sees a matching launch."
            : "Nothing matches this filter."}
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Detected</Th>
                <Th>Verdict</Th>
                <Th>Token</Th>
                <Th>Mint</Th>
                <Th>Creator</Th>
                <Th className="text-right">Slot</Th>
                <Th className="text-right">Decision</Th>
                <Th>Lead vs CA post</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const key = d.hash;
                const expanded = open === key;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setOpen(expanded ? null : key)}
                      className={`cursor-pointer border-b border-line/70 last:border-0 transition hover:bg-panel-2/60 ${expanded ? "bg-panel-2" : ""}`}
                    >
                      <Td className="tabular whitespace-nowrap text-muted">{fmtTime(d.seen_at_unix)}</Td>
                      <Td><VerdictBadge verdict={d.verdict} /></Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <TokenAvatar name={d.name} mint={d.mint} size={26} />
                          <div>
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-muted">${d.symbol}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><Address value={d.mint} kind="mint" /></Td>
                      <Td><Address value={d.creator} /></Td>
                      <Td className="tabular text-right">{num(d.slot)}</Td>
                      <Td className="tabular text-right">{d.decision_ms} ms</Td>
                      <Td>{isOfficial(d.verdict) ? <LeadBadge seenAt={d.seen_at_unix} ann={announcements[d.mint]} /> : <span className="text-muted">—</span>}</Td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-line bg-panel-2">
                        <td colSpan={8} className="space-y-4 px-4 py-4">
                          <div className="text-sm">
                            <span className="text-muted">Reason: </span>
                            {d.reason}
                          </div>
                          <div>
                            <div className="mb-2 text-xs font-medium text-muted">Funding path (who created it ← who funded them)</div>
                            <FundingPath path={d.funding_path} />
                          </div>
                          <div className="grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2 lg:grid-cols-4">
                            <div>Creation tx: <Address value={d.signature} kind="tx" n={6} /></div>
                            <div>Seen: <span className="tabular text-fg">{fmtTime(d.seen_at_unix)}</span></div>
                            <div>Decided: <span className="tabular text-fg">{fmtTime(d.decided_at_unix)}</span></div>
                            <div>Proof hash: <span className="font-mono text-fg">{d.hash.slice(0, 16)}…</span></div>
                          </div>
                          {isOfficial(d.verdict) && (
                            <AnnouncementForm
                              key={announcements[d.mint]?.recorded_at ?? "new"}
                              mint={d.mint}
                              seenAt={d.seen_at_unix}
                              ann={announcements[d.mint]}
                              onSaved={onChange}
                            />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
