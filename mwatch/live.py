"""Live watch-only monitor: watchlist growth, pump.fun creates, and the project's website."""
import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import OrderedDict, deque

import aiohttp

from . import detect
from .alerts import Alerter
from .proof import ProofLog
from .solana import Rpc, is_create_logs, parse_create_event, sol_transfers, tx_creates
from .watchlist import Watchlist

log = logging.getLogger("mwatch.live")

PUMP_ADDR_RE = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}pump")
ASSET_RE = re.compile(r'/assets/index-[A-Za-z0-9_-]+\.js')


class LiveMonitor:
    def __init__(self, cfg, session: aiohttp.ClientSession):
        self.cfg, self.session = cfg, session
        self.rpc = Rpc(cfg.rpc_url, session, cfg.rpc_concurrency)
        self.wl = Watchlist(cfg.files["watchlist"], cfg.anchors)
        self.proof = ProofLog(cfg.files["proof"])
        self.alert = Alerter(session, cfg.telegram_token, cfg.telegram_chat)
        self.ws = None
        self.req_id = 0
        self.pending: dict[int, str] = {}     # request id -> label
        self.subs: dict[int, str] = {}        # subscription id -> label ("pump" or wallet address)
        self.seen: OrderedDict[str, None] = OrderedDict()
        self.stats = {"creates": 0, "matches": 0, "wallet_events": 0}
        self.started_at = time.time()
        self.ws_connected = False
        self.last_create_slot = None
        self.recent_creates: deque[dict] = deque(maxlen=50)  # live feed for the dashboard
        self.launch_rate: OrderedDict[int, int] = OrderedDict()  # unix minute -> pump.fun creates seen

    # ---------- websocket ----------

    async def _subscribe(self, label: str, mention: str):
        if self.ws is None or self.ws.closed:
            return
        self.req_id += 1
        self.pending[self.req_id] = label
        await self.ws.send_json({"jsonrpc": "2.0", "id": self.req_id, "method": "logsSubscribe",
                                 "params": [{"mentions": [mention]}, {"commitment": "processed"}]})

    async def ws_loop(self):
        backoff = 1
        while True:
            try:
                async with self.session.ws_connect(self.cfg.ws_url, heartbeat=20, max_msg_size=0) as ws:
                    self.ws, self.subs, self.pending = ws, {}, {}
                    await self._subscribe("pump", self.cfg.pump_create_mention)
                    for addr in list(self.wl.entries):
                        await self._subscribe(addr, addr)
                    log.info("websocket connected; watching pump.fun creates + %d wallets", len(self.wl))
                    self.ws_connected = True
                    backoff = 1
                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            self._on_message(json.loads(msg.data))
                        elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                            break
            except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as e:
                log.warning("websocket error: %s", e)
            self.ws, self.ws_connected = None, False
            log.warning("websocket disconnected; reconnecting in %ss", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

    def _on_message(self, m: dict):
        if "id" in m and m["id"] in self.pending:
            label = self.pending.pop(m["id"])
            if "result" in m:
                self.subs[m["result"]] = label
                log.debug("subscribed %s (sub %s)", label, m["result"])
            else:
                log.error("subscribe failed for %s: %s", label, m.get("error"))
            return
        if m.get("method") != "logsNotification":
            return
        res = m["params"]["result"]
        label = self.subs.get(m["params"]["subscription"])
        val, slot = res["value"], res["context"]["slot"]
        if val.get("err") or label is None:
            return
        key = f"{label}:{val['signature']}"
        if key in self.seen:
            return
        self.seen[key] = None
        if len(self.seen) > 50_000:
            self.seen.popitem(last=False)
        seen_at = time.time()
        if label == "pump":
            if is_create_logs(val["logs"]):
                asyncio.create_task(self._guard(self.on_create(val["signature"], slot, val["logs"], seen_at)))
        else:
            asyncio.create_task(self._guard(self.on_wallet_activity(label, val["signature"], slot, val["logs"])))

    async def _guard(self, coro):
        try:
            await coro
        except Exception:
            log.exception("handler failed")

    # ---------- handlers ----------

    async def on_create(self, sig: str, slot: int, logs: list[str], seen_at: float):
        self.stats["creates"] += 1
        self.last_create_slot = max(slot, self.last_create_slot or 0)
        minute = int(seen_at // 60) * 60
        self.launch_rate[minute] = self.launch_rate.get(minute, 0) + 1
        while len(self.launch_rate) > 60:
            self.launch_rate.popitem(last=False)
        ev = parse_create_event(logs)
        if ev is None:  # event layout changed; fall back to the full transaction
            tx = await self.rpc.get_tx(sig)
            evs = tx_creates(tx)
            if not evs:
                log.debug("could not decode create %s", sig)
                return
            ev = evs[0]
        log.debug("create slot %s: %s ($%s) %s by %s", slot, ev.get("name"), ev.get("symbol"),
                  ev.get("mint"), ev.get("user"))
        feed = {"slot": slot, "signature": sig, "mint": ev.get("mint"), "name": ev.get("name"),
                "symbol": ev.get("symbol"), "creator": ev.get("user"), "seen_at": seen_at, "verdict": None}
        self.recent_creates.appendleft(feed)
        res = await detect.classify(ev, self.wl, self.cfg, self.rpc)
        if res is None:
            return
        feed["verdict"] = res["verdict"]
        self.stats["matches"] += 1
        decided_at = time.time()
        rec = self.proof.append("DETECTION", verdict=res["verdict"], slot=slot, signature=sig,
                                mint=ev.get("mint"), name=ev.get("name"), symbol=ev.get("symbol"),
                                uri=ev.get("uri"), creator=res["creator"], funding_path=res["path"],
                                reason=res["reason"], seen_at_unix=seen_at, decided_at_unix=decided_at,
                                decision_ms=round((decided_at - seen_at) * 1000))
        if res["verdict"] == detect.COPYCAT and not self.cfg.alert_on_copycats:
            log.info("copycat ignored: %s %s %s", ev.get("name"), ev.get("symbol"), ev.get("mint"))
            return
        icon = {"OFFICIAL": "🟢", "OFFICIAL_TRACED": "🟢", "LIKELY_OFFICIAL": "🟡",
                "TEAM_LAUNCH": "🔵", "COPYCAT": "🔴"}.get(res["verdict"], "")
        path = " <- ".join(p["address"][:6] + "…" for p in res["path"]) or "-"
        await self.alert.send(
            f"{icon} {res['verdict']}  {ev.get('name')} (${ev.get('symbol')})\n"
            f"CA: {ev.get('mint')}\n"
            f"slot {slot} | decided in {rec['decision_ms']} ms\n"
            f"creator: {res['creator']}\n"
            f"path: {path}\n"
            f"https://solscan.io/tx/{sig}\nhttps://pump.fun/coin/{ev.get('mint')}")

    async def on_wallet_activity(self, addr: str, sig: str, slot: int, logs: list[str]):
        """A watchlisted wallet moved SOL: add fresh recipients to the watchlist."""
        self.stats["wallet_events"] += 1
        tx = await self.rpc.get_tx(sig)
        if not tx:
            return
        min_lamports = int(self.cfg.min_transfer_sol * 1e9)
        for src, dst, lamports in sol_transfers(tx):
            if src not in self.wl or not dst or dst in self.wl or lamports < min_lamports:
                continue
            if self.wl.get(src)["depth"] + 1 > self.cfg.max_depth:
                continue
            if not await detect.is_fresh_now(self.rpc, dst, self.cfg.fresh_max_txs):
                continue  # established wallet (e.g. a user payout), not a new deployer
            if not await detect.is_wallet(self.rpc, dst):
                continue  # program account paid for during a launch (bonding curve etc.)
            e = self.wl.add(dst, src, sig, f"fresh wallet funded {lamports / 1e9:.3f} SOL by {src}")
            if not e:
                continue
            await self._subscribe(dst, dst)
            self.proof.append("WATCHLIST_ADD", slot=slot, signature=sig, address=dst, parent=src,
                              depth=e["depth"], lamports=lamports)
            await self.alert.send(f"👀 New wallet on watchlist (depth {e['depth']})\n{dst}\n"
                                  f"funded {lamports / 1e9:.3f} SOL by {src}\nhttps://solscan.io/tx/{sig}")

    # ---------- website ----------

    async def _get(self, url: str) -> str | None:
        try:
            async with self.session.get(url, headers={"User-Agent": "Mozilla/5.0"},
                                        timeout=aiohttp.ClientTimeout(total=20)) as r:
                return await r.text() if r.status == 200 else None
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return None

    async def site_loop(self):
        site = self.cfg.site
        path = self.cfg.files["site_state"]
        state = {}
        if os.path.exists(path):
            with open(path, encoding="utf8") as f:
                state = json.load(f)
        first_run = not state
        state.setdefault("pump_addrs", [])
        state.setdefault("api_keys", {})
        while True:
            changes = []
            html = await self._get(site["base_url"])
            bundle = ASSET_RE.search(html or "")
            if bundle and bundle.group(0) != state.get("bundle"):
                js = await self._get(site["base_url"] + bundle.group(0)) or ""
                found = sorted(set(PUMP_ADDR_RE.findall(js)) - set(state["pump_addrs"]))
                if state.get("bundle"):
                    changes.append(f"new site build: {bundle.group(0)}")
                if found:
                    changes.append("new pump addresses in site code: " + ", ".join(found))
                state["bundle"] = bundle.group(0)
                state["pump_addrs"] = sorted(set(state["pump_addrs"]) | set(found))
            for api in site["api_paths"]:
                body = await self._get(site["base_url"] + api)
                if not body:
                    continue
                try:
                    data = json.loads(body)
                except ValueError:
                    continue
                keys = sorted(data.keys()) if isinstance(data, dict) else []
                old = state["api_keys"].get(api)
                if old is not None and keys != old:
                    changes.append(f"{api} fields changed: +{sorted(set(keys) - set(old))} -{sorted(set(old) - set(keys))}")
                state["api_keys"][api] = keys
                for addr in set(PUMP_ADDR_RE.findall(body)) - set(state["pump_addrs"]):
                    if api in site.get("addr_alert_paths", []):
                        changes.append(f"new pump address in {api}: {addr}")
                    state["pump_addrs"].append(addr)
            with open(path, "w", encoding="utf8") as f:
                json.dump(state, f, indent=2)
            if changes and not first_run:
                h = hashlib.sha256("\n".join(changes).encode()).hexdigest()[:12]
                self.proof.append("SITE_CHANGE", changes=changes, digest=h)
                await self.alert.send("🌐 massive.gg changed\n" + "\n".join(changes))
            first_run = False
            await asyncio.sleep(site["poll_seconds"])

    def _write_status(self):
        """Heartbeat file read by the web dashboard."""
        path = self.cfg.files["status"]
        status = {"pid": os.getpid(), "started_at": self.started_at, "updated_at": time.time(),
                  "ws_connected": self.ws_connected, "rpc_host": self.cfg.rpc_url.split("?")[0],
                  "target": self.cfg.target, "name_patterns": self.cfg.name_patterns,
                  "watchlist_size": len(self.wl), "subscriptions": len(self.subs),
                  "last_create_slot": self.last_create_slot, **self.stats,
                  "recent_creates": list(self.recent_creates),
                  "launch_rate": [[m, n] for m, n in self.launch_rate.items()]}
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf8") as f:
            json.dump(status, f)
        os.replace(tmp, path)

    async def stats_loop(self):
        ticks = 0
        while True:
            try:
                self._write_status()
            except OSError as e:
                log.warning("could not write status file: %s", e)
            await asyncio.sleep(5)
            ticks += 1
            if ticks % 60 == 0:
                log.info("heartbeat: %s creates seen, %s matches, %s wallet events, %s wallets watched",
                         self.stats["creates"], self.stats["matches"], self.stats["wallet_events"], len(self.wl))

    async def run(self):
        log.info("RPC %s", self.cfg.rpc_url.split("?")[0])
        log.info("watchlist: %d wallets (%d anchors)", len(self.wl),
                 sum(1 for e in self.wl.entries.values() if e["depth"] == 0))
        await self.alert.send(f"▶️ mwatch started: {len(self.wl)} wallets, patterns {self.cfg.name_patterns}")
        await asyncio.gather(self.ws_loop(), self.site_loop(), self.stats_loop())
