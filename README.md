# mwatch — Massive.gg launch detector (watch-only PoC)

Detects the official Massive.gg token at pump.fun creation time, before the CA is posted, by
checking **who created it**, not what it's called. Does not buy anything.

## How it decides

1. **Anchors** (`config.json`): wallets verified to belong to the project.
   - `ACTwVD28…` — massive.gg treasury, published by the site itself at
     `https://massive.gg/api/payments/methods/available`. It already created 9 test tokens named
     MASSIVE on pump.fun on 2026-09-30.
   - `E4Kh4vod…` — the wallet that first funded the treasury.
2. **Watchlist growth**: when a watched wallet sends ≥ `min_transfer_sol` to a *fresh* wallet
   (≤ `fresh_max_txs` txs), that wallet is added (depth+1, up to `max_depth`). Established
   wallets such as user payouts are skipped.
3. **Every pump.fun create** is decoded straight from the websocket logs (no extra RPC call):

| Verdict | Meaning |
|---|---|
| `OFFICIAL` | creator on watchlist at depth ≤ `max_official_depth`, name/symbol matches |
| `LIKELY_OFFICIAL` | same, but deeper link |
| `OFFICIAL_TRACED` | creator not on watchlist; live funding trace (≤ `live_trace_hops`) reached it |
| `TEAM_LAUNCH` | watchlisted wallet launched a token with another name |
| `COPYCAT` | name matches, no funding link (logged, not alerted unless `alert_on_copycats`) |

4. **Site watcher**: polls massive.gg's JS bundle and APIs; alerts on a new build, changed API
   fields, or a new `…pump` address appearing.
5. **Proof log** `data/proof.jsonl`: every decision with slot, signature, funding path and
   timing, hash-chained so edits are detectable (`python -m mwatch verify`).

## Setup

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # add HELIUS_API_KEY, optionally Telegram bot token + chat id
```

Without an RPC key it falls back to the public Solana RPC: fine for testing, too rate-limited
for launch day (backtests take ~10 min and may miss transactions).

## Commands

```
.venv\Scripts\python -m mwatch run          # live monitor; leave running until launch
.venv\Scripts\python -m mwatch backtest     # past launches by the treasury and their verdicts
.venv\Scripts\python -m mwatch expand       # pre-load watchlist from anchors' history
.venv\Scripts\python -m mwatch watchlist    # show watched wallets
.venv\Scripts\python -m mwatch verify       # check proof log integrity
.venv\Scripts\python -m unittest discover tests
```

Add `-v` for per-create debug logging.

## Web dashboard (`web/`)

Next.js app for visual verification. It reads the same `data/` folder the watcher writes, so the
two only need to run on the same machine; no extra configuration.

```
cd web
npm install
npm run build
npm run start          # http://127.0.0.1:3100 (bound to localhost only)
```

| Tab | Shows |
|---|---|
| Overview | monitor heartbeat (Live / Reconnecting / Offline), counters, official detections with their lead over the CA post, backtest summary, recent activity |
| Detections | every decision; click a row for the funding path (creator ← funder ← anchor), timings, tx links, and a form to record when the official CA was posted |
| Watchlist | anchors and the wallets they funded, as a tree |
| Backtest | results of `python -m mwatch backtest`, verdict breakdown and full launch table |
| Proof log | every record with its hash link; the hash chain is re-verified in the dashboard on every refresh |

Integration points:

- `data/status.json`: heartbeat written by `mwatch run` every 5 s.
- `data/proof.jsonl`: detections, watchlist adds, site changes (append-only, hash-chained).
- `data/watchlist.json`, `data/backtests/<wallet>.json`: written by the watcher.
- `data/announcements.json`: written by the dashboard when you record a CA post time; never
  touched by the watcher, and not part of the hash chain.

Set `MWATCH_DATA_DIR` to read a different folder. `npm run test:proof` checks the dashboard's
hash verification against the Python implementation, including a tampered copy.

## Proving it to the client

After launch, compare the `DETECTION` record for the official mint (slot + `seen_at_unix`) with
the timestamp of the official CA post. The slot is on-chain and independently checkable.

## Limits

- If the team deploys from a wallet with no funding link to the anchors (e.g. straight from an
  exchange), nothing flags `OFFICIAL` before the CA post. The log will show that honestly.
- Only pump.fun creates are watched. A launch directly on Raydium/Meteora would need another
  subscription.
- Watch-only: buy execution is the next stage.
