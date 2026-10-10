import { IconArrowLeft } from "./icons";
import { Address } from "./ui";
import type { PathHop } from "@/lib/types";

/** Creator <- funder <- ... <- anchor, as a chain of wallet cards. */
export default function FundingPath({ path }: { path: PathHop[] }) {
  if (!path.length) return <p className="text-sm text-muted">No funding link to the project&apos;s wallets.</p>;
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {path.map((hop, i) => {
        const isAnchor = hop.depth === 0 || i === path.length - 1;
        const role = i === 0 ? "Token creator" : isAnchor ? "Project anchor" : `Funder · depth ${hop.depth ?? "?"}`;
        return (
          <li key={hop.address + i} className="flex items-center gap-2">
            <div
              className={`min-w-48 rounded-xl border px-3 py-2.5 ${
                isAnchor ? "border-ok/40 bg-ok-bg" : i === 0 ? "border-accent/40 bg-panel-solid" : "border-line bg-panel-solid"
              }`}
            >
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${isAnchor ? "text-ok-ink" : i === 0 ? "text-accent-ink" : "text-muted"}`}>
                {role}
              </div>
              <div className="-ml-1 mt-0.5"><Address value={hop.address} n={5} /></div>
              {hop.reason && <div className="mt-1 max-w-64 text-xs text-muted">{hop.reason}</div>}
              {hop.funding_sig && (
                <div className="mt-1 flex items-center text-xs text-muted">
                  funded in <Address value={hop.funding_sig} kind="tx" />
                </div>
              )}
            </div>
            {i < path.length - 1 && (
              <span className="flex flex-col items-center text-[10px] text-muted">
                <IconArrowLeft width={18} height={18} />
                funded by
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
