"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VERDICTS, verdictMeta } from "./ui";
import type { BacktestLaunch } from "@/lib/types";

const DOT = 12; // marker diameter (>= 8px), with a 2px surface ring
const ROW = DOT + 4;
const PAD = 12;

const hhmm = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 16);

/**
 * One lane per UTC day. x = time of creation within that day's active window; dots that would
 * overlap stack upward (beeswarm) so every launch stays visible and hoverable.
 */
export default function BacktestTimeline({ launches }: { launches: BacktestLaunch[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<BacktestLaunch | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = useMemo(() => {
    const byDay = new Map<string, BacktestLaunch[]>();
    for (const l of launches) {
      const day = new Date(l.block_time * 1000).toISOString().slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), l]);
    }
    const plotW = Math.max(200, width - 110);
    return [...byDay.entries()].map(([day, items]) => {
      items.sort((a, b) => a.block_time - b.block_time);
      // Active window, padded 15 min each side (at least 1h wide).
      let lo = items[0].block_time - 900;
      let hi = items[items.length - 1].block_time + 900;
      if (hi - lo < 3600) {
        const mid = (lo + hi) / 2;
        lo = mid - 1800;
        hi = mid + 1800;
      }
      const placed: { l: BacktestLaunch; x: number; row: number }[] = [];
      for (const l of items) {
        const x = PAD + ((l.block_time - lo) / (hi - lo)) * (plotW - 2 * PAD);
        let row = 0;
        while (placed.some((p) => p.row === row && Math.abs(p.x - x) < DOT + 2)) row++;
        placed.push({ l, x, row });
      }
      const rows = Math.max(1, ...placed.map((p) => p.row + 1));
      return { day, lo, hi, placed, rows, plotW };
    });
  }, [launches, width]);

  const present = VERDICTS.filter((v) => launches.some((l) => l.verdict === v.key));

  return (
    <div ref={ref} className="px-4 py-4">
      {/* legend: always present for >= 2 series, fixed verdict order */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {present.map((v) => (
          <span key={v.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${v.mark}`} /> {v.label}
          </span>
        ))}
      </div>

      <div className="space-y-5">
        {lanes.map(({ day, lo, hi, placed, rows, plotW }) => (
          <div key={day} className="flex items-end gap-3">
            <div className="w-[86px] shrink-0 pb-5">
              <div className="text-xs font-medium">{day.slice(5)}</div>
              <div className="text-[11px] text-muted">{placed.length} launch{placed.length === 1 ? "" : "es"}</div>
            </div>
            <div className="relative" style={{ width: plotW }}>
              <div className="relative" style={{ height: rows * ROW + 6 }}>
                {placed.map(({ l, x, row }) => {
                  const m = verdictMeta(l.verdict);
                  const active = hover?.signature === l.signature;
                  return (
                    <a
                      key={l.signature}
                      href={`https://solscan.io/tx/${l.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      onMouseEnter={() => setHover(l)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(l)}
                      onBlur={() => setHover(null)}
                      aria-label={`${l.name} ($${l.symbol}), ${m.label}, ${hhmm(l.block_time)} UTC`}
                      className="absolute -translate-x-1/2 p-1" // hit target larger than the mark
                      style={{ left: x, bottom: row * ROW }}
                    >
                      <span
                        className={`block rounded-full ring-2 ring-panel-solid transition-transform ${m.mark} ${active ? "scale-125" : ""}`}
                        style={{ width: DOT, height: DOT }}
                      />
                    </a>
                  );
                })}
                {hover && placed.some((p) => p.l.signature === hover.signature) && (() => {
                  const p = placed.find((q) => q.l.signature === hover.signature)!;
                  return (
                    <div
                      className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-panel-solid px-2.5 py-1.5 text-xs shadow-panel"
                      style={{ left: Math.min(Math.max(p.x, 90), plotW - 90), bottom: p.row * ROW + ROW + 10 }}
                    >
                      <div className="font-semibold">{hover.name} <span className="font-normal text-muted">${hover.symbol}</span></div>
                      <div className="text-muted">{hhmm(hover.block_time)} UTC · {verdictMeta(hover.verdict).label}</div>
                    </div>
                  );
                })()}
              </div>
              <div className="h-px bg-line-strong" />
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>{hhmm(lo)}</span>
                <span>{hhmm((lo + hi) / 2)}</span>
                <span>{hhmm(hi)} UTC</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
