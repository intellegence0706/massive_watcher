"""mwatch: watch-only launch detector for a target project's pump.fun token.

  python -m mwatch run                     live monitor (watch-only, no buying)
  python -m mwatch backtest [--wallet W]   which past launches would have been flagged
  python -m mwatch expand                  grow watchlist from anchors' history
  python -m mwatch watchlist               print the watchlist
  python -m mwatch verify                  check the proof log hash chain
"""
import argparse
import asyncio
import logging
import os
import sys

import aiohttp

from . import config as config_mod
from .proof import verify
from .solana import Rpc
from .watchlist import Watchlist


async def _with_session(fn):
    async with aiohttp.ClientSession() as session:
        return await fn(session)


def main():
    ap = argparse.ArgumentParser(prog="mwatch", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default="config.json")
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run")
    bt = sub.add_parser("backtest")
    bt.add_argument("--wallet", help="defaults to the first anchor")
    bt.add_argument("--limit", type=int, default=2000)
    bt.add_argument("--out", default=None)
    ex = sub.add_parser("expand")
    ex.add_argument("--limit", type=int, default=1000, help="transactions scanned per wallet")
    sub.add_parser("watchlist")
    sub.add_parser("prune", help="remove program accounts (non-wallets) from the watchlist")
    sub.add_parser("verify")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    cfg = config_mod.load(args.config)
    if cfg.rpc_url == config_mod.PUBLIC_RPC and args.cmd in ("run", "backtest", "expand"):
        logging.warning("No HELIUS_API_KEY/RPC_URL set: using the public RPC (slow, rate-limited). "
                        "Fine for testing, not for launch day.")

    if args.cmd == "run":
        from .live import LiveMonitor
        asyncio.run(_with_session(lambda s: LiveMonitor(cfg, s).run()))
    elif args.cmd == "backtest":
        from .history import backtest
        wallet = args.wallet or next(iter(cfg.anchors))
        out = args.out or os.path.join(os.path.dirname(cfg.files["proof"]), f"backtest_{wallet[:8]}.md")
        asyncio.run(_with_session(lambda s: backtest(cfg, Rpc(cfg.rpc_url, s, cfg.rpc_concurrency), wallet, args.limit, out)))
    elif args.cmd == "expand":
        from .history import expand
        asyncio.run(_with_session(lambda s: expand(cfg, Rpc(cfg.rpc_url, s, cfg.rpc_concurrency), args.limit)))
    elif args.cmd == "prune":
        from .history import prune
        asyncio.run(_with_session(lambda s: prune(cfg, Rpc(cfg.rpc_url, s, cfg.rpc_concurrency))))
    elif args.cmd == "watchlist":
        wl = Watchlist(cfg.files["watchlist"], cfg.anchors)
        for addr, e in sorted(wl.entries.items(), key=lambda kv: kv[1]["depth"]):
            print(f"depth {e['depth']}  {addr}  {e['reason']}")
    elif args.cmd == "verify":
        ok, n = verify(cfg.files["proof"])
        print(f"{'OK' if ok else 'BROKEN'}: {n} records verified")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
