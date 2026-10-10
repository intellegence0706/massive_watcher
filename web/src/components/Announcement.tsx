"use client";

import { useState } from "react";

import { fmtDuration, fmtTime } from "@/lib/format";
import type { Announcement } from "@/lib/types";

export function LeadBadge({ seenAt, ann }: { seenAt: number; ann?: Announcement }) {
  if (!ann) return <span className="text-xs text-muted">CA post time not recorded</span>;
  const lead = ann.posted_at - seenAt;
  return lead > 0 ? (
    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok-ink ring-1 ring-inset ring-ok/25">
      {fmtDuration(lead)} before CA post
    </span>
  ) : (
    <span className="rounded-full bg-bad-bg px-2 py-0.5 text-xs font-medium text-bad-ink ring-1 ring-inset ring-bad/25">
      {fmtDuration(-lead)} after CA post
    </span>
  );
}

function toLocalInput(unix: number) {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Record when the official CA was publicly posted (X/Telegram), to measure the detection lead. */
export function AnnouncementForm({ mint, seenAt, ann, onSaved }: { mint: string; seenAt: number; ann?: Announcement; onSaved: () => void }) {
  const [value, setValue] = useState(ann ? toLocalInput(ann.posted_at) : "");
  const [source, setSource] = useState(ann?.source ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [err, setErr] = useState("");
  const parsed = value ? new Date(value).getTime() / 1000 : NaN;

  async function save() {
    setState("saving");
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint, posted_at: parsed, source }),
    }).catch(() => null);
    if (!res?.ok) {
      setErr((await res?.json().catch(() => null))?.error ?? "request failed");
      setState("error");
      return;
    }
    setState("idle");
    onSaved();
  }

  async function clear() {
    await fetch(`/api/announcements?mint=${mint}`, { method: "DELETE" });
    setValue("");
    setSource("");
    onSaved();
  }

  return (
    <div className="rounded-xl border border-line bg-panel-solid p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium">Official CA announcement</div>
        <LeadBadge seenAt={seenAt} ann={ann} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Posted at (your local time)
          <input
            type="datetime-local"
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted">
          Source link (X / Telegram post)
          <input
            type="url"
            value={source}
            placeholder="https://x.com/…/status/…"
            onChange={(e) => setSource(e.target.value)}
            className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          disabled={!Number.isFinite(parsed) || state === "saving"}
          onClick={save}
          className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3.5 py-1.5 text-sm font-medium text-white shadow-panel disabled:opacity-40"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {ann && (
          <button type="button" onClick={clear} className="rounded-md px-2 py-1.5 text-sm text-muted hover:text-fg">
            Clear
          </button>
        )}
      </div>
      <div className="mt-2 text-xs text-muted">
        {Number.isFinite(parsed) && <>= {fmtTime(parsed)} · </>}detected {fmtTime(seenAt)}
        {ann?.source && (
          <>
            {" · "}
            <a href={ann.source} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
              source
            </a>
          </>
        )}
        {state === "error" && <span className="ml-2 text-bad-ink">{err}</span>}
      </div>
    </div>
  );
}
