import { connection } from "next/server";

import { loadSnapshot } from "@/lib/data";

export async function GET() {
  await connection(); // always read fresh from disk
  try {
    return Response.json(await loadSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
