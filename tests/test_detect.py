"""Offline checks: python -m unittest discover tests"""
import asyncio
import json
import os
import tempfile
import unittest

from mwatch import detect
from mwatch.proof import ProofLog, verify
from mwatch.solana import b58decode, b58encode
from mwatch.watchlist import Watchlist

TREASURY = "ACTwVD28XfbDKesMA1BEtH6158J7QKMRK2TotDBDfkB5"
FRESH = "BJPZGeT8A6ZVqK1jSUMo53LF5fMCXX45cZef4zzxmQQS"
DEEP = "4ShiTC8XKtzSkDwdEL7Msf8WtuNz2LvJskZtcXxg6hA5"
STRANGER = "G7FdH7HNMmzSuv22HEek5DhpSzg731449RLvcbJf2gR7"


class Cfg:
    name_patterns = ["massive"]
    max_official_depth = 1
    live_trace_hops = 2
    trace_timeout_seconds = 1


class DetectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.wl = Watchlist(os.path.join(self.tmp, "wl.json"), {TREASURY: "treasury"})
        self.wl.add(FRESH, TREASURY, "sig1", "fresh")
        self.wl.add(DEEP, FRESH, "sig2", "fresh")

    def run_classify(self, **ev):
        return asyncio.run(detect.classify(ev, self.wl, Cfg(), rpc=None))

    def test_anchor_launch_is_official(self):
        r = self.run_classify(name="MassiveDOTGG", symbol="MASSIVE", user=TREASURY, mint="x")
        self.assertEqual(r["verdict"], detect.OFFICIAL)

    def test_depth1_launch_is_official_with_path(self):
        r = self.run_classify(name="Massive", symbol="MSV", user=FRESH, mint="x")
        self.assertEqual(r["verdict"], detect.OFFICIAL)
        self.assertEqual([p["address"] for p in r["path"]], [FRESH, TREASURY])

    def test_depth2_launch_is_likely(self):
        r = self.run_classify(name="MASSIVE", symbol="MASSIVE", user=DEEP, mint="x")
        self.assertEqual(r["verdict"], detect.LIKELY_OFFICIAL)

    def test_copycat(self):
        r = self.run_classify(name="Massive.gg", symbol="MASSIVE", user=STRANGER, mint="x")
        self.assertEqual(r["verdict"], detect.COPYCAT)

    def test_team_other_name(self):
        r = self.run_classify(name="Tom Turbo", symbol="TT", user=TREASURY, mint="x")
        self.assertEqual(r["verdict"], detect.TEAM_LAUNCH)

    def test_unrelated_ignored(self):
        self.assertIsNone(self.run_classify(name="Pepe", symbol="PEPE", user=STRANGER, mint="x"))

    def test_name_normalisation(self):
        self.assertTrue(detect.name_matches(["massive"], "M.A.S.S.I.V.E", ""))
        self.assertTrue(detect.name_matches(["massive"], "", "$massive"))


class ProofTests(unittest.TestCase):
    def test_tamper_detected(self):
        path = os.path.join(tempfile.mkdtemp(), "p.jsonl")
        log = ProofLog(path)
        log.append("A", x=1)
        log.append("B", x=2)
        self.assertEqual(verify(path), (True, 2))
        lines = open(path, encoding="utf8").read().splitlines()
        rec = json.loads(lines[0])
        rec["x"] = 999
        lines[0] = json.dumps(rec)
        open(path, "w", encoding="utf8").write("\n".join(lines) + "\n")
        self.assertFalse(verify(path)[0])


class B58Tests(unittest.TestCase):
    def test_roundtrip(self):
        self.assertEqual(b58encode(b58decode(TREASURY)), TREASURY)


if __name__ == "__main__":
    unittest.main()
