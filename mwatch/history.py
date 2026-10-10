"""Offline tools: backtest a wallet's past launches, and grow the watchlist from anchor history."""
import asyncio
import datetime as dt
import json
import logging
import os

from . import detect
from .solana import Rpc, sol_transfers, tx_creates, tx_signer
from .watchlist import Watchlist

log = logging.getLogger("mwatch.history")


def _ts(t) -> str:
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S") if t else "?"


async def _all_sigs(rpc: Rpc, addr: str, limit: int) -> list[dict]:
    out, before = [], None
    while len(out) < limit:
        page = await rpc.get_sigs(addr, limit=min(1000, limit - len(out)), before=before)
        if not page:
            break
        out += page
        before = page[-1]["signature"]
        if len(page) < 1000:
            break
    return [s for s in out if not s.get("err")]


async def _fetch_txs(rpc: Rpc, sigs: list[dict]) -> tuple[list[dict], int]:
    """Returns (transactions, number that could not be fetched)."""
    txs, done = [], 0
    for i in range(0, len(sigs), 20):
        chunk = await asyncio.gather(*(rpc.get_tx(s["signature"], wait_s=0) for s in sigs[i:i + 20]))
        txs += [t for t in chunk if t]
        done += len(sigs[i:i + 20])
        log.info("fetched %d/%d transactions", done, len(sigs))
    missing = len(sigs) - len(txs)
    if missing:
        log.warning("%d of %d transactions could not be fetched (RPC rate limits?)", missing, len(sigs))
    return txs, missing


def _write_backtest_json(cfg, wl: Watchlist, wallet: str, rows: list, scanned: int, missing: int):
    """Machine-readable copy of the backtest for the web dashboard."""
    out_dir = cfg.files["backtests"]
    os.makedirs(out_dir, exist_ok=True)
    data = {
        "wallet": wallet,
        "generated_at": dt.datetime.now(dt.timezone.utc).timestamp(),
        "name_patterns": cfg.name_patterns,
        "wallet_depth": wl.get(wallet)["depth"] if wallet in wl else None,
        "transactions": scanned,
        "missing": missing,
        "launches": [{"block_time": t, "slot": slot, "name": ev.get("name"), "symbol": ev.get("symbol"),
                      "uri": ev.get("uri"), "mint": ev.get("mint"), "creator": ev.get("creator") or ev.get("user"),
                      "verdict": verdict, "signature": sig} for t, slot, ev, verdict, sig in rows],
    }
    path = os.path.join(out_dir, f"{wallet}.json")
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f, indent=2)
    log.info("backtest data written to %s", path)


async def backtest(cfg, rpc: Rpc, wallet: str, limit: int, out_path: str):
    """List every pump.fun token this wallet created and how the bot would have classified it."""
    wl = Watchlist(cfg.files["watchlist"], cfg.anchors)
    sigs = await _all_sigs(rpc, wallet, limit)
    log.info("%s: %d transactions", wallet, len(sigs))
    txs, missing = await _fetch_txs(rpc, sigs)
    rows = []
    for tx in txs:
        for ev in tx_creates(tx):
            if tx_signer(tx) != wallet and wallet not in (ev.get("user"), ev.get("creator")):
                continue
            res = await detect.classify(ev, wl, cfg, rpc=None)
            rows.append((tx["blockTime"], tx["slot"], ev, res["verdict"] if res else "IGNORED",
                         tx["transaction"]["signatures"][0]))
    rows.sort(key=lambda r: r[1])
    _write_backtest_json(cfg, wl, wallet, rows, len(sigs), missing)

    lines = [f"# Backtest: launches created by `{wallet}`", "",
             f"Generated {_ts(dt.datetime.now(dt.timezone.utc).timestamp())} UTC. "
             f"Name patterns: {cfg.name_patterns}. Wallet on watchlist: "
             f"{'yes, depth ' + str(wl.get(wallet)['depth']) if wallet in wl else 'no'}.", "",
             "| Time (UTC) | Slot | Name | Symbol | Verdict | Mint | Tx |", "|---|---|---|---|---|---|---|"]
    for t, slot, ev, verdict, sig in rows:
        lines.append(f"| {_ts(t)} | {slot} | {ev.get('name')} | {ev.get('symbol')} | **{verdict}** | "
                     f"`{ev.get('mint')}` | [tx](https://solscan.io/tx/{sig}) |")
    flagged = sum(1 for r in rows if r[3] in (detect.OFFICIAL, detect.LIKELY_OFFICIAL))
    lines += ["", f"{len(rows)} launches found, {flagged} flagged as the target project at creation time.",
              f"Scanned {len(sigs) - missing}/{len(sigs)} transactions."]
    if missing:
        lines.append(f"**INCOMPLETE: {missing} transactions could not be fetched; rerun with a dedicated RPC.**")
    lines += ["", "Compare each flagged slot/time with the official CA post time to measure the lead."]
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nreport written to {out_path}")


async def prune(cfg, rpc: Rpc):
    """Remove non-anchor watchlist entries that are program accounts rather than wallets (and their children)."""
    wl = Watchlist(cfg.files["watchlist"], cfg.anchors)
    bad = set()
    for addr, e in list(wl.entries.items()):
        if e["depth"] > 0 and not await detect.is_wallet(rpc, addr):
            bad.add(addr)
    changed = True
    while changed:  # drop descendants of removed entries too
        changed = False
        for addr, e in wl.entries.items():
            if addr not in bad and e["parent"] in bad:
                bad.add(addr)
                changed = True
    for addr in bad:
        print(f"- {addr}  ({wl.entries[addr]['reason']})")
        del wl.entries[addr]
    wl.save()
    print(f"removed {len(bad)}; watchlist now has {len(wl)} wallets")


async def expand(cfg, rpc: Rpc, limit_per_wallet: int):
    """Walk anchors' outgoing SOL history; add recipients whose first-ever tx was that funding."""
    wl = Watchlist(cfg.files["watchlist"], cfg.anchors)
    min_lamports = int(cfg.min_transfer_sol * 1e9)
    frontier = [a for a, e in wl.entries.items() if e["depth"] < cfg.max_depth]
    checked: set[str] = set()
    while frontier:
        nxt = []
        for src in frontier:
            log.info("scanning %s (depth %d)", src, wl.get(src)["depth"])
            txs, _ = await _fetch_txs(rpc, await _all_sigs(rpc, src, limit_per_wallet))
            for tx in txs:
                sig = tx["transaction"]["signatures"][0]
                for s, dst, lamports in sol_transfers(tx):
                    if s != src or not dst or dst in wl or dst in checked or lamports < min_lamports:
                        continue
                    checked.add(dst)
                    if await detect.was_fresh_at(rpc, dst, sig) and await detect.is_wallet(rpc, dst):
                        e = wl.add(dst, src, sig, f"first tx was {lamports / 1e9:.3f} SOL from {src} "
                                                  f"at {_ts(tx['blockTime'])}")
                        if e:
                            print(f"+ {dst}  depth {e['depth']}  <- {src}  ({lamports / 1e9:.3f} SOL, {_ts(tx['blockTime'])})")
                            if e["depth"] < cfg.max_depth:
                                nxt.append(dst)
        frontier = nxt
    print(f"watchlist now has {len(wl)} wallets -> {cfg.files['watchlist']}")
