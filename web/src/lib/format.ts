export const short = (a: string | null | undefined, n = 4) =>
  !a ? "—" : a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;

export function fmtTime(unix: number | null | undefined): string {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function fmtAgo(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  let s = Math.abs(Math.round(seconds));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;
  const parts = d ? [`${d}d`, `${h}h`] : h ? [`${h}h`, `${m}m`] : m ? [`${m}m`, `${s}s`] : [`${s}s`];
  return sign + parts.join(" ");
}

export const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

export const links = {
  tx: (sig: string) => `https://solscan.io/tx/${sig}`,
  account: (a: string) => `https://solscan.io/account/${a}`,
  pump: (mint: string) => `https://pump.fun/coin/${mint}`,
};
