"""
etk_mcp/db.py
═════════════════════════════════════════════════════════════════════════════════
Decoupled read-only database access for the MCP server.

Owns its OWN psycopg2 connection to the Supabase Postgres pooler — it does NOT
import the agent's `pipeline` module (which would pull in ChromaDB + Ollama at
import time). Every query is read-only, statement-timeout bounded, row-capped, and
served through a small in-process TTL cache so repeated reads don't hit the DB.
═════════════════════════════════════════════════════════════════════════════════
"""
import datetime
import decimal
import time
from urllib.parse import urlparse

import psycopg2

from et_mcp.settings import settings


def _dsn() -> str | None:
    """Connection URL (libpq handles percent-encoded passwords and ?sslmode=...)."""
    for secret in (settings.supabase_pooler_db_url, settings.supabase_db_url, settings.database_url):
        if secret and secret.get_secret_value().strip():
            return secret.get_secret_value().strip()
    return None


def _config_from_env() -> dict:
    """Build psycopg2 connect kwargs from a URL, else from individual DB_* settings."""
    common = {"options": f"-c search_path={settings.catalog_schema}", "connect_timeout": 15}
    dsn = _dsn()
    if dsn:
        return {"dsn": dsn, **common}
    return {
        "host": settings.db_host,
        "port": settings.db_port,
        "dbname": settings.db_name,
        "user": settings.db_user,
        "password": settings.db_password.get_secret_value() if settings.db_password else None,
        **common,
    }


DB_CONFIG = _config_from_env()

# Safety / performance limits — read from standalone settings
STATEMENT_TIMEOUT_MS = settings.db_statement_timeout_ms
ROW_CAP = settings.db_row_limit
CACHE_TTL_S = settings.cache_ttl_s

_cache: dict = {}  # key -> (timestamp, payload)


def get_connection():
    """Open a fresh read-only psycopg2 connection scoped to the catalog schema."""
    if "dsn" not in DB_CONFIG:
        missing = [k for k in ("host", "user", "password") if not DB_CONFIG.get(k)]
        if missing:
            raise ValueError(
                "Catalog DB is not configured: set SUPABASE_DB_URL "
                f"(or {', '.join('DB_' + k.upper() for k in missing)}) in mcp-server/.env."
            )
    try:
        conn = psycopg2.connect(**DB_CONFIG)
    except psycopg2.OperationalError as error:
        host = urlparse(DB_CONFIG.get("dsn", "")).hostname or DB_CONFIG.get("host", "")
        if host.startswith("db.") and host.endswith(".supabase.co") and any(
            text in str(error).lower() for text in ("could not translate host", "network is unreachable", "unreachable network")
        ):
            raise ConnectionError(
                "The Supabase direct database endpoint is unreachable from this machine. "
                "On an IPv4-only network, set SUPABASE_POOLER_DB_URL to the Session pooler "
                "connection string from Supabase's Connect dialog."
            ) from error
        raise
    conn.set_session(readonly=True, autocommit=True)
    return conn


def _jsonable(v):
    """Coerce DB values into JSON-serialisable Python types."""
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    return v


def safe_execute(sql: str, params: tuple = None, use_cache: bool = True) -> dict:
    """Run a read-only query and return a structured result.

    Returns {"columns": [...], "rows": [ {col: val} ], "row_count": N, "truncated": bool}.
    Raises on DB error (callers wrap into an {"error": ...} payload).
    """
    cache_key = (sql, params)
    now = time.time()
    if use_cache and cache_key in _cache:
        ts, payload = _cache[cache_key]
        if now - ts < CACHE_TTL_S:
            return payload

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS};")
        cur.execute(sql, params)
        columns = [d[0] for d in cur.description] if cur.description else []
        fetched = cur.fetchmany(ROW_CAP + 1) if columns else []
        truncated = len(fetched) > ROW_CAP
        rows = [
            {col: _jsonable(val) for col, val in zip(columns, r)}
            for r in fetched[:ROW_CAP]
        ]
        payload = {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "truncated": truncated,
        }
        if use_cache:
            for key in [k for k, (ts, _) in _cache.items() if now - ts >= CACHE_TTL_S]:
                del _cache[key]
            _cache[cache_key] = (now, payload)
        return payload
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def clear_cache():
    """Drop the query cache (e.g. after a known data refresh)."""
    _cache.clear()
