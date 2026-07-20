"""
ingest_macro_events.py — Eventos macro (FOMC, CPI, emprego, GDP) em market_events.
Cron semanal: python scripts/ingest_macro_events.py

Fonte 100% curada a partir de scripts/data/macro_events.json: FOMC vem do
calendário oficial da Federal Reserve; CPI/JOBS/GDP/PCE vêm do calendário
oficial do OMB ("Schedule of Release Dates for Principal Federal Economic
Indicators") — já reflete eventuais ajustes pós-shutdown. Sem chamadas a
APIs pagas (o economic calendar da Finnhub é premium). Ver comentário no
JSON para as fontes exatas e a metodologia de actual/previous.

Upsert em market_events, chaveado por (type, date). Idempotente: pode
correr tantas vezes quantas quiser sem duplicar linhas.
"""

import os
import sys
import json
import uuid
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from urllib.parse import urlparse

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "macro_events.json")

if os.environ.get("GITHUB_ACTIONS") != "true":
    ENV_FILE = os.path.join(ROOT, ".env.dev")
    if not os.path.exists(ENV_FILE):
        sys.exit(
            "ERRO: ficheiro .env.dev não encontrado.\n"
            "Estes scripts só correm contra a BD de desenvolvimento."
        )
    load_dotenv(ENV_FILE)

DIRECT_URL = os.getenv("DIRECT_URL")
if not DIRECT_URL:
    sys.exit("DIRECT_URL não definida no .env.dev")


def load_curated_events() -> list[dict]:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload.get("events", [])


def upsert_events(cur, events: list[dict]) -> int:
    if not events:
        return 0

    payload = [
        (
            uuid.uuid4().hex,
            e["type"],
            e["date"],
            e.get("time"),
            e["title"],
            e.get("importance", "MEDIUM"),
            e.get("country", "US"),
            e.get("actual"),
            e.get("estimate"),
            e.get("previous"),
        )
        for e in events
    ]

    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO market_events (
            "id", "type", "date", "time", "title", "importance", "country",
            "actual", "estimate", "previous", "source", "createdAt", "updatedAt"
        )
        VALUES %s
        ON CONFLICT ("type", "date") DO UPDATE SET
            "time"       = EXCLUDED."time",
            "title"      = EXCLUDED."title",
            "importance" = EXCLUDED."importance",
            "country"    = EXCLUDED."country",
            "actual"     = COALESCE(EXCLUDED."actual", market_events."actual"),
            "estimate"   = COALESCE(EXCLUDED."estimate", market_events."estimate"),
            "previous"   = COALESCE(EXCLUDED."previous", market_events."previous"),
            "updatedAt"  = NOW()
        """,
        payload,
        template=(
            "(%s, %s::\"market_event_type\", %s, %s, %s, "
            "%s::\"event_importance\", %s, %s, %s, %s, 'curated', NOW(), NOW())"
        ),
    )
    return len(payload)


def main():
    print(f"A ligar a {urlparse(DIRECT_URL).hostname}...")
    conn = psycopg2.connect(DIRECT_URL)
    conn.autocommit = False

    events = load_curated_events()
    print(f"{len(events)} eventos curados em {DATA_FILE}.")

    try:
        with conn.cursor() as cur:
            n = upsert_events(cur, events)
        conn.commit()
        print(f"Concluído. {n} eventos upserted.")
    except Exception as e:
        conn.rollback()
        sys.exit(f"ERRO DB: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
