"""Wallets linked to the target project. Depth 0 = verified anchor, depth N = funded N hops from an anchor."""
import json
import os
import time


class Watchlist:
    def __init__(self, path: str, anchors: dict[str, str]):
        self.path = path
        self.entries: dict[str, dict] = {}
        if os.path.exists(path):
            with open(path, encoding="utf8") as f:
                self.entries = json.load(f)
        for addr, note in anchors.items():
            self.entries[addr] = {"depth": 0, "parent": None, "sig": None, "reason": note,
                                  "added_at": self.entries.get(addr, {}).get("added_at", time.time())}
        self.save()

    def __contains__(self, addr) -> bool:
        return addr in self.entries

    def __len__(self) -> int:
        return len(self.entries)

    def get(self, addr: str) -> dict | None:
        return self.entries.get(addr)

    def add(self, addr: str, parent: str, sig: str, reason: str) -> dict | None:
        if addr in self.entries or parent not in self.entries:
            return None
        e = {"depth": self.entries[parent]["depth"] + 1, "parent": parent, "sig": sig,
             "reason": reason, "added_at": time.time()}
        self.entries[addr] = e
        self.save()
        return e

    def path_to_anchor(self, addr: str) -> list[dict]:
        """Funding chain from addr back to its anchor, e.g. [deployer, funder, anchor]."""
        chain, seen = [], set()
        while addr and addr in self.entries and addr not in seen:
            seen.add(addr)
            e = self.entries[addr]
            chain.append({"address": addr, "depth": e["depth"], "funding_sig": e["sig"], "reason": e["reason"]})
            addr = e["parent"]
        return chain

    def save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf8") as f:
            json.dump(self.entries, f, indent=2)
        os.replace(tmp, self.path)
