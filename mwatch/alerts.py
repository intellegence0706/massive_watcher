"""Console + optional Telegram alerts."""
import logging

import aiohttp

log = logging.getLogger("mwatch.alert")


class Alerter:
    def __init__(self, session: aiohttp.ClientSession, bot_token: str | None, chat_id: str | None):
        self.session, self.token, self.chat_id = session, bot_token, chat_id

    async def send(self, text: str):
        log.warning("ALERT\n%s", text)
        if not (self.token and self.chat_id):
            return
        try:
            async with self.session.post(
                    f"https://api.telegram.org/bot{self.token}/sendMessage",
                    json={"chat_id": self.chat_id, "text": text, "disable_web_page_preview": True},
                    timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    log.warning("telegram send failed: HTTP %s", resp.status)
        except Exception as e:  # alerts must never crash the watcher
            log.warning("telegram send failed: %s", e)
