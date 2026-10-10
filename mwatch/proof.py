"""Append-only, hash-chained JSONL log. Editing or deleting an earlier line breaks every later hash."""
import datetime as dt
import hashlib
import json
import os


class ProofLog:
    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.prev = "0" * 64
        if os.path.exists(path):
            with open(path, encoding="utf8") as f:
                for line in f:
                    if line.strip():
                        self.prev = json.loads(line)["hash"]

    def append(self, kind: str, **data) -> dict:
        rec = {"kind": kind, "logged_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(), **data,
               "prev": self.prev}
        rec["hash"] = hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest()
        with open(self.path, "a", encoding="utf8") as f:
            f.write(json.dumps(rec) + "\n")
        self.prev = rec["hash"]
        return rec


def verify(path: str) -> tuple[bool, int]:
    """Recompute the chain; returns (ok, records_checked)."""
    prev, n = "0" * 64, 0
    with open(path, encoding="utf8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            h = rec.pop("hash")
            if rec["prev"] != prev or hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest() != h:
                return False, n
            prev, n = h, n + 1
    return True, n
