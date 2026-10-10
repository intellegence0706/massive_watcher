"""Solana RPC client and pump.fun decoding helpers."""
import asyncio
import base64
import hashlib
import logging
import struct

import aiohttp

log = logging.getLogger("mwatch.rpc")

PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
SYSTEM_PROGRAM = "11111111111111111111111111111111"
CREATE_EVENT_DISC = hashlib.sha256(b"event:CreateEvent").digest()[:8]

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    s = ""
    while n:
        n, r = divmod(n, 58)
        s = B58[r] + s
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + s


def b58decode(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + B58.index(c)
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\0" * (len(s) - len(s.lstrip("1"))) + body


class _Reader:
    def __init__(self, raw: bytes, offset: int = 0):
        self.raw, self.o = raw, offset

    def string(self) -> str:
        n = struct.unpack_from("<I", self.raw, self.o)[0]
        if n > 1000:
            raise ValueError("implausible string length")
        s = self.raw[self.o + 4:self.o + 4 + n].decode("utf8", "replace")
        self.o += 4 + n
        return s

    def pubkey(self) -> str:
        if self.o + 32 > len(self.raw):
            raise ValueError("short pubkey")
        k = b58encode(self.raw[self.o:self.o + 32])
        self.o += 32
        return k

    def remaining(self) -> int:
        return len(self.raw) - self.o


def parse_create_event(logs: list[str]) -> dict | None:
    """Decode pump.fun's CreateEvent from 'Program data:' log lines (no extra RPC call needed)."""
    for line in logs or []:
        if not line.startswith("Program data: "):
            continue
        try:
            raw = base64.b64decode(line[len("Program data: "):])
        except ValueError:
            continue
        if raw[:8] != CREATE_EVENT_DISC:
            continue
        try:
            r = _Reader(raw, 8)
            ev = {"name": r.string(), "symbol": r.string(), "uri": r.string(),
                  "mint": r.pubkey(), "bonding_curve": r.pubkey(), "user": r.pubkey()}
            if r.remaining() >= 32:
                ev["creator"] = r.pubkey()
            return ev
        except (ValueError, struct.error):
            return None
    return None


def parse_create_ix(data_b58: str) -> dict | None:
    """Fallback: decode name/symbol/uri from the create instruction data."""
    try:
        r = _Reader(b58decode(data_b58), 8)
        return {"name": r.string(), "symbol": r.string(), "uri": r.string()}
    except (ValueError, struct.error):
        return None


def is_create_logs(logs: list[str]) -> bool:
    # Matches both "Instruction: Create" and "Instruction: CreateV2".
    return any("Instruction: Create" in l for l in logs or [])


def tx_signer(tx: dict) -> str:
    return tx["transaction"]["message"]["accountKeys"][0]["pubkey"]


def tx_creates(tx: dict) -> list[dict]:
    """Return pump.fun creates in a jsonParsed transaction."""
    if not tx or tx["meta"].get("err"):
        return []
    logs = tx["meta"].get("logMessages") or []
    if not is_create_logs(logs):
        return []
    ev = parse_create_event(logs)
    if ev:
        return [ev]
    # Older/changed event layout: decode the instruction and take the mint from post token balances.
    for ix in tx["transaction"]["message"]["instructions"]:
        if ix.get("programId") == PUMP_PROGRAM and "data" in ix:
            meta = parse_create_ix(ix["data"])
            if meta:
                mints = {b["mint"] for b in tx["meta"].get("postTokenBalances") or []}
                meta["mint"] = next((m for m in mints if m.endswith("pump")), next(iter(mints), "?"))
                meta["user"] = tx_signer(tx)
                return [meta]
    return []


def sol_transfers(tx: dict):
    """Yield (source, destination, lamports) for every system-program SOL move, incl. inner instructions."""
    if not tx or tx["meta"].get("err"):
        return
    ixs = list(tx["transaction"]["message"]["instructions"])
    for inner in tx["meta"].get("innerInstructions") or []:
        ixs.extend(inner["instructions"])
    for ix in ixs:
        if ix.get("programId") != SYSTEM_PROGRAM or not isinstance(ix.get("parsed"), dict):
            continue
        p, info = ix["parsed"].get("type"), ix["parsed"].get("info", {})
        if p in ("transfer", "transferWithSeed"):
            yield info.get("source"), info.get("destination"), int(info.get("lamports", 0))
        elif p in ("createAccount", "createAccountWithSeed"):
            # Only plain wallets; skip program accounts (bonding curves, token accounts) paid for during a launch.
            if info.get("owner") == SYSTEM_PROGRAM:
                yield info.get("source"), info.get("newAccount"), int(info.get("lamports", 0))


class Rpc:
    def __init__(self, url: str, session: aiohttp.ClientSession, concurrency: int = 4):
        self.url, self.session = url, session
        self.sem = asyncio.Semaphore(concurrency)
        self._id = 0

    async def call(self, method: str, params: list, retries: int = 8):
        delay = 0.5
        for attempt in range(retries):
            self._id += 1
            try:
                async with self.sem:
                    async with self.session.post(
                            self.url, json={"jsonrpc": "2.0", "id": self._id, "method": method, "params": params},
                            timeout=aiohttp.ClientTimeout(total=30)) as resp:
                        if resp.status == 429 or resp.status >= 500:
                            raise RuntimeError(f"HTTP {resp.status}")
                        out = await resp.json(content_type=None)
                    if "error" in out:
                        raise RuntimeError(out["error"])
                    return out["result"]
            except (aiohttp.ClientError, asyncio.TimeoutError, RuntimeError) as e:
                if attempt == retries - 1:
                    log.warning("%s failed after %d tries: %s", method, retries, e)
                    return None
                # Back off outside the semaphore so other requests aren't blocked by our sleep.
                await asyncio.sleep(delay)
                delay = min(delay * 2, 15)

    async def get_tx(self, sig: str, wait_s: float = 8.0):
        """Fetch a jsonParsed tx; retries while a just-seen tx isn't queryable yet."""
        loop = asyncio.get_running_loop()
        deadline = loop.time() + wait_s
        while True:
            tx = await self.call("getTransaction", [sig, {"encoding": "jsonParsed", "commitment": "confirmed",
                                                          "maxSupportedTransactionVersion": 0}])
            if tx or loop.time() > deadline:
                return tx
            await asyncio.sleep(0.4)

    async def get_sigs(self, addr: str, limit: int = 1000, before: str | None = None) -> list[dict]:
        opts = {"limit": limit}
        if before:
            opts["before"] = before
        return await self.call("getSignaturesForAddress", [addr, opts]) or []
