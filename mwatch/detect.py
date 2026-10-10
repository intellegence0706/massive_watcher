"""Decide whether a new pump.fun token belongs to the target project."""
import asyncio
import logging
import re

from .solana import SYSTEM_PROGRAM, Rpc, sol_transfers
from .watchlist import Watchlist

log = logging.getLogger("mwatch.detect")

OFFICIAL = "OFFICIAL"                # creator is an anchor or a wallet funded by one, name matches
LIKELY_OFFICIAL = "LIKELY_OFFICIAL"  # same, but the link is deeper than max_official_depth
OFFICIAL_TRACED = "OFFICIAL_TRACED"  # creator not on watchlist, but a live funding trace reached it
TEAM_LAUNCH = "TEAM_LAUNCH"          # team wallet launched something with a different name
COPYCAT = "COPYCAT"                  # name matches, no link to the project


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def name_matches(patterns: list[str], name: str, symbol: str) -> bool:
    n, s = _norm(name), _norm(symbol)
    return any(_norm(p) in n or _norm(p) in s for p in patterns)


async def is_wallet(rpc: Rpc, addr: str) -> bool:
    """True for a plain System-Program-owned account (something that can sign), False for program PDAs."""
    info = await rpc.call("getAccountInfo", [addr, {"encoding": "base64", "dataSlice": {"offset": 0, "length": 0}}])
    value = (info or {}).get("value")
    # A closed/emptied account (value None) was necessarily a plain wallet: PDAs can't be drained by transfer.
    return value is None or value.get("owner") == SYSTEM_PROGRAM


async def is_fresh_now(rpc: Rpc, addr: str, max_txs: int) -> bool:
    """Live mode: a just-funded deployer wallet has (almost) no history."""
    return len(await rpc.get_sigs(addr, limit=max_txs + 1)) <= max_txs


async def was_fresh_at(rpc: Rpc, addr: str, funding_sig: str) -> bool:
    """History mode: the funding tx was the wallet's very first transaction."""
    sigs = await rpc.get_sigs(addr, limit=1000)
    return bool(sigs) and len(sigs) < 1000 and sigs[-1]["signature"] == funding_sig


async def trace_back(rpc: Rpc, wl: Watchlist, addr: str, hops: int, fanout: int = 3) -> list[str] | None:
    """Follow SOL funding of addr backwards up to `hops`; return [addr, ..., watchlisted wallet] or None."""
    frontier, seen = [(addr, [addr])], {addr}
    for _ in range(hops):
        nxt = []
        for a, path in frontier:
            sigs = await rpc.get_sigs(a, limit=100)
            txs = await asyncio.gather(*(rpc.get_tx(s["signature"], wait_s=0) for s in sigs[-fanout:]))
            for tx in txs:
                for src, dst, _ in sol_transfers(tx):
                    if dst != a or not src or src in seen:
                        continue
                    if src in wl:
                        return path + [src]
                    seen.add(src)
                    nxt.append((src, path + [src]))
        frontier = nxt[:fanout]
        if not frontier:
            break
    return None


async def classify(ev: dict, wl: Watchlist, cfg, rpc: Rpc | None = None) -> dict | None:
    """Return a verdict dict, or None for tokens we don't care about."""
    creators = [a for a in {ev.get("user"), ev.get("creator")} if a]
    matched = name_matches(cfg.name_patterns, ev.get("name", ""), ev.get("symbol", ""))
    linked = [a for a in creators if a in wl]

    if linked:
        best = min(linked, key=lambda a: wl.get(a)["depth"])
        depth = wl.get(best)["depth"]
        if not matched:
            verdict = TEAM_LAUNCH
        elif depth <= cfg.max_official_depth:
            verdict = OFFICIAL
        else:
            verdict = LIKELY_OFFICIAL
        return {"verdict": verdict, "creator": best, "depth": depth, "path": wl.path_to_anchor(best),
                "reason": f"creator {best} is on watchlist at depth {depth}"}

    if not matched:
        return None

    if rpc is not None:
        creator = ev.get("user") or ev.get("creator")
        try:
            chain = await asyncio.wait_for(trace_back(rpc, wl, creator, cfg.live_trace_hops),
                                           cfg.trace_timeout_seconds)
        except asyncio.TimeoutError:
            chain = None
            log.info("live trace timed out for %s", creator)
        if chain:
            return {"verdict": OFFICIAL_TRACED, "creator": creator, "depth": len(chain) - 1,
                    "path": [{"address": a} for a in chain] + wl.path_to_anchor(chain[-1])[1:],
                    "reason": f"live trace: {' <- '.join(chain)}"}

    return {"verdict": COPYCAT, "creator": ev.get("user"), "depth": None, "path": [],
            "reason": "name/symbol match but no funding link to the project"}
