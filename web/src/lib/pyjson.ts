// Re-implements the proof-log hash check from mwatch/proof.py:
//   hash = sha256(json.dumps(record_without_hash, sort_keys=True))
// Python's json.dumps uses ", " / ": " separators and ensure_ascii escaping. Numbers are kept as
// their original text (not parsed to JS numbers) so 1.0 stays "1.0" and the bytes match exactly.

import { createHash } from "node:crypto";

class RawNumber {
  readonly raw: string;
  constructor(raw: string) {
    this.raw = raw;
  }
}

type PyValue = null | boolean | string | RawNumber | PyValue[] | { [k: string]: PyValue };

function parse(text: string): PyValue {
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const value = (): PyValue => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const obj: { [k: string]: PyValue } = {};
      ws();
      if (text[i] === "}") return i++, obj;
      for (;;) {
        ws();
        const k = str();
        ws();
        if (text[i++] !== ":") throw new Error(`expected ':' at ${i}`);
        obj[k] = value();
        ws();
        const d = text[i++];
        if (d === "}") return obj;
        if (d !== ",") throw new Error(`expected ',' or '}' at ${i}`);
      }
    }
    if (c === "[") {
      i++;
      const arr: PyValue[] = [];
      ws();
      if (text[i] === "]") return i++, arr;
      for (;;) {
        arr.push(value());
        ws();
        const d = text[i++];
        if (d === "]") return arr;
        if (d !== ",") throw new Error(`expected ',' or ']' at ${i}`);
      }
    }
    if (c === '"') return str();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    const m = /^-?(?:\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?|^-?Infinity|^NaN/.exec(text.slice(i));
    if (!m) throw new Error(`unexpected token at ${i}`);
    i += m[0].length;
    return new RawNumber(m[0]);
  };
  const str = (): string => {
    if (text[i] !== '"') throw new Error(`expected string at ${i}`);
    const start = i++;
    while (text[i] !== '"') {
      if (text[i] === "\\") i++;
      i++;
      if (i >= text.length) throw new Error("unterminated string");
    }
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const v = value();
  ws();
  if (i !== text.length) throw new Error(`trailing data at ${i}`);
  return v;
}

const ESC: Record<string, string> = {
  '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f",
};

function pyStr(s: string): string {
  let out = '"';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    const code = s.charCodeAt(k); // UTF-16 code unit, same as Python's surrogate-pair escaping
    if (ESC[ch]) out += ESC[ch];
    else if (code < 0x20 || code > 0x7e) out += "\\u" + code.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

function pyDumpSorted(v: PyValue): string {
  if (v === null) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "string") return pyStr(v);
  if (v instanceof RawNumber) return v.raw;
  if (Array.isArray(v)) return "[" + v.map(pyDumpSorted).join(", ") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => `${pyStr(k)}: ${pyDumpSorted(v[k])}`).join(", ") + "}";
}

export interface ChainCheck {
  ok: boolean;
  records: number;
  brokenAtLine: number | null;
  error: string | null;
}

/** Same algorithm as `python -m mwatch verify`. */
export function verifyProofLog(content: string): ChainCheck {
  let prev = "0".repeat(64);
  let n = 0;
  const lines = content.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line.trim()) continue;
    try {
      const rec = parse(line) as { [k: string]: PyValue };
      const h = rec.hash;
      delete rec.hash;
      if (typeof h !== "string" || rec.prev !== prev) {
        return { ok: false, records: n, brokenAtLine: idx + 1, error: "prev-hash link broken" };
      }
      const digest = createHash("sha256").update(pyDumpSorted(rec), "utf8").digest("hex");
      if (digest !== h) {
        return { ok: false, records: n, brokenAtLine: idx + 1, error: "record content does not match its hash" };
      }
      prev = h;
      n++;
    } catch (e) {
      return { ok: false, records: n, brokenAtLine: idx + 1, error: `unparseable line: ${(e as Error).message}` };
    }
  }
  return { ok: true, records: n, brokenAtLine: null, error: null };
}
