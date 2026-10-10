"""Loads config.json plus secrets from environment / .env."""
import json
import os
from dataclasses import dataclass

PUBLIC_RPC = "https://api.mainnet-beta.solana.com"
PUBLIC_WS = "wss://api.mainnet-beta.solana.com"


def _load_dotenv(path: str):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = v.strip()
                if v[:1] in ('"', "'"):
                    v = v[1:].split(v[0], 1)[0]  # quoted value: keep '#' inside quotes
                else:
                    v = v.split(" #", 1)[0].split("\t#", 1)[0].strip()  # drop inline comment
                    if v.startswith("#"):
                        v = ""
                os.environ.setdefault(k.strip(), v)


@dataclass
class Config:
    raw: dict
    rpc_url: str
    ws_url: str
    telegram_token: str | None
    telegram_chat: str | None

    def __getattr__(self, name):
        try:
            return self.raw[name]
        except KeyError:
            raise AttributeError(name)


def load(path: str = "config.json") -> Config:
    base = os.path.dirname(os.path.abspath(path))
    _load_dotenv(os.path.join(base, ".env"))
    with open(path, encoding="utf8") as f:
        raw = json.load(f)
    files = raw.setdefault("files", {})
    files.setdefault("status", "data/status.json")
    files.setdefault("backtests", "data/backtests")
    for k, v in files.items():
        raw["files"][k] = os.path.join(base, v)

    key = os.environ.get("HELIUS_API_KEY")
    rpc = os.environ.get("RPC_URL") or (f"https://mainnet.helius-rpc.com/?api-key={key}" if key else PUBLIC_RPC)
    ws = os.environ.get("WS_URL") or (f"wss://mainnet.helius-rpc.com/?api-key={key}" if key else PUBLIC_WS)
    if rpc == PUBLIC_RPC:
        raw["rpc_concurrency"] = 1  # the public endpoint 429s quickly
    return Config(raw, rpc, ws, os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID"))
