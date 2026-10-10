// Cross-checks the dashboard's proof verifier against the Python writer (mwatch/proof.py).
// Python writes records with awkward values (unicode, emoji, floats like 1.0 and 1e-07, nesting);
// the TS verifier must accept them byte-for-byte, and must reject a tampered copy.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { verifyProofLog } from "../src/lib/pyjson.ts";

const root = path.resolve(import.meta.dirname, "..", "..");
const venvPy = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = existsSync(venvPy) ? venvPy : "python";
const out = path.join(mkdtempSync(path.join(tmpdir(), "mwatch-proof-")), "proof.jsonl");

const py = `
import sys
sys.path.insert(0, ${JSON.stringify(root)})
from mwatch.proof import ProofLog, verify
log = ProofLog(sys.argv[1])
log.append("DETECTION", verdict="OFFICIAL", name="MASSIVE 🚀 Ünïcode", symbol="MAS\\u2028SIVE", slot=451885171,
           seen_at_unix=1790000000.0, decided_at_unix=1790000000.1234567, decision_ms=12, tiny=1e-07, big=1e+22,
           neg=-0.5, quote='he said "hi"\\\\path\\n\\t', funding_path=[{"address": "A", "depth": 0, "funding_sig": None}],
           nested={"b": [1, 2.5, {"z": True, "a": False}], "a": []}, empty={})
log.append("WATCHLIST_ADD", address="B", parent="A", depth=1, lamports=97200622, slot=1, signature="s")
log.append("SITE_CHANGE", changes=["new build: /assets/index-X.js", "émoji 😀"], digest="abc")
print(verify(sys.argv[1]))
`;
const pyResult = execFileSync(python, ["-c", py, out], { encoding: "utf8" }).trim();
const content = readFileSync(out, "utf8");

let failed = false;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed = true;
};

check(`python verify reports ${pyResult}`, pyResult === "(True, 3)");
const ok = verifyProofLog(content);
check(`TS verifies untouched log (${ok.records} records)`, ok.ok && ok.records === 3);

const lines = content.trimEnd().split("\n");
const tampered = lines.map((l, i) => (i === 0 ? l.replace('"slot": 451885171', '"slot": 451885170') : l)).join("\n") + "\n";
writeFileSync(out + ".tampered", tampered);
const bad = verifyProofLog(tampered);
check(`TS rejects edited record (broken at line ${bad.brokenAtLine})`, !bad.ok && bad.brokenAtLine === 1);

const dropped = [lines[0], lines[2]].join("\n") + "\n";
const gap = verifyProofLog(dropped);
check(`TS rejects deleted record (broken at line ${gap.brokenAtLine})`, !gap.ok && gap.brokenAtLine === 2);

process.exit(failed ? 1 : 0);
