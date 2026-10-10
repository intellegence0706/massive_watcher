"use client";

import { useMemo, useState } from "react";

import BacktestTimeline from "./BacktestTimeline";
import { IconHistory, IconSearch, IconShield, IconTarget, IconTree } from "./icons";
import { Address, Empty, Panel, Stat, Td, Th, TokenAvatar, VERDICTS, VerdictBadge, isOfficial } from "./ui";
import { fmtTime, num, short } from "@/lib/format";
import type { Backtest, Verdict } from "@/lib/types";

export default function BacktestView({ backtests }: { backtests: Backtest[] }) {
  const ranked = useMemo(
    () => [...backtests].sort((a, b) => b.launches.filter((l) => isOfficial(l.verdict)).length - a.launches.filter((l) => isOfficial(l.verdict)).length),
    [backtests],
  );
  const [wallet, setWallet] = useState(ranked[0]?.wallet);
  const [only, setOnly] = useState<Verdict | null>(null);
  const bt = ranked.find((b) => b.wallet === wallet) ?? ranked[0];

  const counts = useMemo(() => {
    const c = new Map<Verdict, number>();
    bt?.launches.forEach((l) => c.set(l.verdict, (c.get(l.verdict) ?? 0) + 1));
    return c;
  }, [bt]);

  if (!bt) {
    return (
      <Panel title="Backtest" icon={<IconHistory width={14} height={14} />}>
        <Empty icon={<IconHistory width={18} height={18} />}>
          No backtest yet. Run <code className="font-mono">python -m mwatch backtest</code> in the watcher folder.
        </Empty>
      </Panel>
    );
  }

  const flagged = bt.launches.filter((l) => isOfficial(l.verdict)).length;
  const rows = only ? bt.launches.filter((l) => l.verdict === only) : bt.launches;
  const present = VERDICTS.filter((v) => counts.get(v.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {ranked.length > 1 && (
          <div className="flex rounded-xl border border-line bg-panel p-0.5 backdrop-blur-xl">
            {ranked.map((b) => (
              <button
                key={b.wallet}
                type="button"
                onClick={() => { setWallet(b.wallet); setOnly(null); }}
                className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${b.wallet === bt.wallet ? "bg-panel-solid font-medium shadow-panel" : "text-muted hover:text-fg"}`}
              >
                {short(b.wallet, 5)} <span className="font-sans text-muted">· {b.launches.length}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center text-sm text-muted">
          Launches created by <Address value={bt.wallet} n={6} />
          <span>
            {bt.wallet_depth === 0 ? "· anchor" : bt.wallet_depth != null ? `· watchlist depth ${bt.wallet_depth}` : "· not on watchlist"} · generated{" "}
            {fmtTime(bt.generated_at)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Launches found" value={num(bt.launches.length)} icon={<IconHistory width={14} height={14} />} tone="accent" />
        <Stat
          label="Flagged as the project"
          value={num(flagged)}
          tone={flagged ? "ok" : "none"}
          hint={`name matches “${bt.name_patterns.join(", ")}”`}
          icon={<IconTarget width={14} height={14} />}
        />
        <Stat label="Team launches, other names" value={num(counts.get("TEAM_LAUNCH") ?? 0)} icon={<IconTree width={14} height={14} />} />
        <Stat
          label="Transactions scanned"
          value={`${num(bt.transactions - bt.missing)}/${num(bt.transactions)}`}
          tone={bt.missing ? "bad" : "ok"}
          hint={bt.missing ? "incomplete: rerun with a dedicated RPC" : "complete, nothing skipped"}
          icon={<IconShield width={14} height={14} />}
        />
      </div>

      {bt.launches.length > 0 ? (
        <>
          <Panel title="Launch timeline" icon={<IconHistory width={14} height={14} />} right={<span className="text-xs text-muted">hover a dot for details · click to open the tx</span>}>
            <BacktestTimeline launches={bt.launches} />
          </Panel>

          <Panel
            title="All launches"
            icon={<IconSearch width={14} height={14} />}
            right={
              <div className="flex flex-wrap gap-1.5">
                {present.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setOnly(only === v.key ? null : v.key)}
                    className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1 text-xs transition ${only === v.key ? "border-accent bg-panel-2" : "border-line hover:border-line-strong"}`}
                  >
                    <VerdictBadge verdict={v.key} />
                    <span className="tabular pr-1 font-semibold">{counts.get(v.key)}</span>
                  </button>
                ))}
                {only && (
                  <button type="button" onClick={() => setOnly(null)} className="px-2 text-xs text-muted hover:text-fg">
                    Clear
                  </button>
                )}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <Th className="pl-4">Token</Th>
                    <Th>Verdict</Th>
                    <Th>Created (UTC)</Th>
                    <Th className="text-right">Slot</Th>
                    <Th>Mint</Th>
                    <Th>Tx</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.signature} className={`border-b border-line/70 last:border-0 hover:bg-panel-2/60 ${isOfficial(l.verdict) ? "" : "text-fg/80"}`}>
                      <Td className="pl-4">
                        <div className="flex items-center gap-2.5">
                          <TokenAvatar name={l.name} mint={l.mint} size={26} />
                          <div>
                            <div className="font-medium">{l.name}</div>
                            <div className="text-xs text-muted">${l.symbol}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><VerdictBadge verdict={l.verdict} /></Td>
                      <Td className="tabular whitespace-nowrap text-muted">{fmtTime(l.block_time).replace(" UTC", "")}</Td>
                      <Td className="tabular text-right text-xs text-muted">{num(l.slot)}</Td>
                      <Td><Address value={l.mint} kind="mint" /></Td>
                      <Td><Address value={l.signature} kind="tx" /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title="Launches" icon={<IconHistory width={14} height={14} />}>
          <Empty icon={<IconHistory width={18} height={18} />}>
            This wallet never created a pump.fun token in the {num(bt.transactions)} transactions scanned. It funds wallets rather than launching itself.
          </Empty>
        </Panel>
      )}
    </div>
  );
}
