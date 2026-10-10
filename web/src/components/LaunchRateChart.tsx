"use client";

import { useState } from "react";

const SLOTS = 60;

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const hhmm = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 16);

/** pump.fun launches the monitor saw per minute, last hour. Single series: title names it, no legend. */
export default function LaunchRateChart({ rate, now }: { rate: [number, number][]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const counts = new Map(rate);
  const first = rate.length ? rate[0][0] : Infinity;
  const current = Math.floor(now / 60) * 60;
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const minute = current - (SLOTS - 1 - i) * 60;
    // Minutes before the monitor's first sample are "no data", not zero.
    return { minute, n: minute < first ? null : (counts.get(minute) ?? 0), partial: minute === current };
  });
  const complete = slots.filter((s) => s.n !== null && !s.partial) as { minute: number; n: number }[];
  const max = niceMax(Math.max(1, ...slots.map((s) => s.n ?? 0)));
  const avg = complete.length ? complete.reduce((a, s) => a + s.n, 0) / complete.length : null;
  const peak = complete.length ? Math.max(...complete.map((s) => s.n)) : null;
  const h = hover !== null ? slots[hover] : null;

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div>
          <span className="tabular text-2xl font-semibold tracking-tight">{avg === null ? "—" : avg.toFixed(1)}</span>
          <span className="ml-1.5 text-xs text-muted">launches / min avg</span>
        </div>
        <div className="text-xs text-muted">
          peak <span className="tabular font-medium text-fg">{peak ?? "—"}</span>
        </div>
        <div className="text-xs text-muted">
          {complete.length} min of data
        </div>
      </div>

      <div className="relative">
        {/* y gridlines: recessive, 3 levels */}
        <div className="pointer-events-none absolute inset-0 bottom-5 flex flex-col justify-between">
          {[max, max / 2, 0].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="tabular w-6 shrink-0 text-right text-[10px] text-muted">{v}</span>
              <div className={`h-px flex-1 ${v === 0 ? "bg-line-strong" : "bg-line"}`} />
            </div>
          ))}
        </div>

        <div className="relative ml-8 flex h-32 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {slots.map((s, i) => (
            <div
              key={s.minute}
              className="relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              aria-label={s.n === null ? `${hhmm(s.minute)} UTC: no data` : `${hhmm(s.minute)} UTC: ${s.n} launches`}
            >
              {s.n !== null && s.n > 0 && (
                <div
                  className={`w-full rounded-t-[4px] transition-[height] duration-500 ${s.partial ? "bg-accent/35" : hover === i ? "bg-accent-ink" : "bg-accent"}`}
                  style={{ height: `${(s.n / max) * 100}%` }}
                />
              )}
            </div>
          ))}

          {h && hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-panel-solid px-2.5 py-1.5 text-xs shadow-panel"
              style={{ left: `${((hover + 0.5) / SLOTS) * 100}%` }}
            >
              <div className="text-muted">{hhmm(h.minute)} UTC{h.partial && " · in progress"}</div>
              <div className="tabular font-semibold">{h.n === null ? "monitor not running" : `${h.n} launches`}</div>
            </div>
          )}
        </div>

        <div className="ml-8 mt-1.5 flex justify-between text-[10px] text-muted">
          <span>{hhmm(slots[0].minute)}</span>
          <span>{hhmm(slots[30].minute)}</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}
