"use client";

import { useState, type ReactNode } from "react";

import { IconCheck, IconCopy, IconExternal } from "./icons";
import { links, short } from "@/lib/format";
import type { Verdict } from "@/lib/types";

// Fixed verdict order + colors (validated CVD-safe as a set in this order).
export const VERDICTS: { key: Verdict; label: string; mark: string; badge: string }[] = [
  { key: "OFFICIAL", label: "Official", mark: "bg-ok", badge: "bg-ok-bg text-ok-ink ring-ok/25" },
  { key: "OFFICIAL_TRACED", label: "Official · traced", mark: "bg-ok", badge: "bg-ok-bg text-ok-ink ring-ok/25" },
  { key: "LIKELY_OFFICIAL", label: "Likely official", mark: "bg-warn", badge: "bg-warn-bg text-warn-ink ring-warn/25" },
  { key: "TEAM_LAUNCH", label: "Team · other name", mark: "bg-info", badge: "bg-info-bg text-info-ink ring-info/25" },
  { key: "COPYCAT", label: "Copycat", mark: "bg-bad", badge: "bg-bad-bg text-bad-ink ring-bad/25" },
  { key: "IGNORED", label: "Ignored", mark: "bg-muted", badge: "bg-neutral-bg text-muted ring-line" },
];
export const verdictMeta = (v: string) => VERDICTS.find((x) => x.key === v) ?? VERDICTS[VERDICTS.length - 1];

export const isOfficial = (v: string) => v === "OFFICIAL" || v === "OFFICIAL_TRACED" || v === "LIKELY_OFFICIAL";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const s = verdictMeta(verdict);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>
      <span className={`size-1.5 rounded-full ${s.mark}`} />
      {s.label}
    </span>
  );
}

export function Address({ value, kind = "account", n = 4 }: { value: string | null | undefined; kind?: "account" | "tx" | "mint"; n?: number }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted">—</span>;
  const href = kind === "tx" ? links.tx(value) : links.account(value);
  return (
    <span className="group/addr inline-flex items-center gap-0.5 whitespace-nowrap rounded-md font-mono text-[12.5px]">
      <a href={href} target="_blank" rel="noreferrer" className="rounded px-1 py-0.5 hover:bg-panel-2 hover:text-accent-ink" title={value}>
        {short(value, n)}
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        className={`rounded p-1 transition hover:bg-panel-2 hover:text-fg ${copied ? "text-ok-ink" : "text-muted opacity-60 group-hover/addr:opacity-100"}`}
        aria-label={`Copy ${value}`}
        title="Copy"
      >
        {copied ? <IconCheck width={12} height={12} /> : <IconCopy width={12} height={12} />}
      </button>
      {kind === "mint" && (
        <a
          href={links.pump(value)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-sans text-[11px] text-muted opacity-60 transition hover:bg-panel-2 hover:text-fg group-hover/addr:opacity-100"
          title="Open on pump.fun"
        >
          pump <IconExternal width={10} height={10} />
        </a>
      )}
    </span>
  );
}

export function Panel({ title, icon, right, children, className = "" }: {
  title?: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-panel shadow-panel backdrop-blur-xl ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {icon && <span className="grid size-6 place-items-center rounded-lg bg-panel-2 text-muted">{icon}</span>}
            {title}
          </h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const TONE = {
  ok: { num: "text-ok-ink", chip: "bg-ok-bg text-ok-ink" },
  bad: { num: "text-bad-ink", chip: "bg-bad-bg text-bad-ink" },
  warn: { num: "text-warn-ink", chip: "bg-warn-bg text-warn-ink" },
  accent: { num: "text-fg", chip: "bg-panel-2 text-accent-ink" },
  none: { num: "text-fg", chip: "bg-panel-2 text-muted" },
};

export function Stat({ label, value, hint, tone = "none", icon }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof TONE; icon?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel px-4 py-3.5 shadow-panel backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted">{label}</div>
        {icon && <span className={`grid size-7 place-items-center rounded-lg ${t.chip}`}>{icon}</span>}
      </div>
      <div className={`tabular mt-1.5 text-[28px] font-semibold leading-none tracking-tight ${t.num}`}>{value}</div>
      {hint && <div className="mt-1.5 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-muted">
      {icon && <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel-2">{icon}</span>}
      <div className="max-w-md">{children}</div>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

/** Decorative monogram for a token (not data-encoding: hue is derived from the mint for recognisability). */
export function TokenAvatar({ name, mint, size = 28 }: { name: string; mint: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < mint.length; i++) h = (h * 31 + mint.charCodeAt(i)) % 360;
  const letter = (name || "?").trim().replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?";
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-1 ring-inset ring-white/15"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 55% 48%), hsl(${(h + 40) % 360} 60% 38%))` }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
