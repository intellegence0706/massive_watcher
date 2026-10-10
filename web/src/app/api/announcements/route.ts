import { connection } from "next/server";

import { readAnnouncements, writeAnnouncements } from "@/lib/data";

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Records when the official CA was publicly posted, so the dashboard can show the detection lead.
export async function POST(request: Request) {
  await connection();
  let body: { mint?: unknown; posted_at?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { mint, posted_at, source } = body;
  if (typeof mint !== "string" || !MINT_RE.test(mint)) {
    return Response.json({ error: "mint must be a base58 address" }, { status: 400 });
  }
  const now = Date.now() / 1000;
  if (typeof posted_at !== "number" || !Number.isFinite(posted_at) || posted_at < 1.5e9 || posted_at > now + 3600) {
    return Response.json({ error: "posted_at must be a unix timestamp, not in the future" }, { status: 400 });
  }
  const src = typeof source === "string" ? source.trim().slice(0, 300) : "";

  const all = await readAnnouncements();
  all[mint] = { posted_at, source: src, recorded_at: now };
  await writeAnnouncements(all);
  return Response.json({ ok: true, announcement: all[mint] });
}

export async function DELETE(request: Request) {
  await connection();
  const mint = new URL(request.url).searchParams.get("mint");
  if (!mint || !MINT_RE.test(mint)) return Response.json({ error: "mint required" }, { status: 400 });
  const all = await readAnnouncements();
  delete all[mint];
  await writeAnnouncements(all);
  return Response.json({ ok: true });
}
