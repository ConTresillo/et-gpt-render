"""
etk_mcp/query.py
═════════════════════════════════════════════════════════════════════════════════
Safe query layer for the MCP tools.

  search_products  — structured filtered search over a table or a whole family
                     (whitelisted columns only; values safely escaped).
  find_extreme     — cross-table superlatives (cheapest/heaviest overall, etc.),
                     reusing the deterministic UNION-expander.
  get_product      — full row(s) for a specific model name.
  run_select       — escape hatch: client-written SELECT, validated read-only +
                     grounded by SQLValidator, then executed.

All execution goes through etk_mcp.db.safe_execute (read-only, timeout, row cap,
TTL cache).
═════════════════════════════════════════════════════════════════════════════════
"""
import os

from .sql_validator import SQLValidator
from .multi_table import expand_to_tables

from . import db, indexes
from et_mcp.settings import settings

PRICE_COLUMNS = {"list_price", "price_usd"}
HIDDEN_COLUMNS = PRICE_COLUMNS if settings.catalog_hide_prices else set()

_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
_validator = SQLValidator(os.path.join(_ROOT, "schema_registry.json"), schema=settings.catalog_schema,
                          hidden_columns=HIDDEN_COLUMNS)

ALLOWED_OPS = {"=", "!=", "<>", "<", "<=", ">", ">=", "ILIKE", "LIKE",
               "IS NULL", "IS NOT NULL"}
MAX_LIMIT = settings.db_row_limit


def _run(sql: str) -> dict:
    try:
        result = db.safe_execute(sql)
    except Exception as e:
        return {"error": f"Catalog query failed: {str(e)[:300]}", "sql": sql}
    if HIDDEN_COLUMNS and any(c in HIDDEN_COLUMNS for c in result["columns"]):
        result = {**result,
                  "columns": [c for c in result["columns"] if c not in HIDDEN_COLUMNS],
                  "rows": [{k: v for k, v in row.items() if k not in HIDDEN_COLUMNS} for row in result["rows"]]}
    return result


def _lit(value) -> str:
    """Render a Python value as a safe SQL literal (whitelisted columns/ops mean
    only the VALUE is user-controlled here)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _clamp_limit(limit) -> int:
    try:
        return max(1, min(int(limit), MAX_LIMIT))
    except (TypeError, ValueError):
        return 50


# ── search_products ─────────────────────────────────────────────────────────────

def search_products(table: str = None, family: str = None, filters: list = None,
                    columns: list = None, sort: dict = None, limit=50) -> dict:
    """Filtered search over one table or all tables in a family."""
    filters = filters or []
    columns = columns or ["model_name"]
    if "model_name" not in columns:
        columns = ["model_name"] + columns

    # Resolve the scope's tables.
    if table:
        if not indexes.is_table(table):
            return {"error": f"Unknown table '{table}'. Call list_tables()."}
        scope_tables = [table]
    elif family:
        scope_tables = indexes.tables_in_family(family)
        if not scope_tables:
            return {"error": f"Unknown family '{family}'. Call list_families()."}
    else:
        return {"error": "Provide either 'table' or 'family'."}

    # Validate filter ops and collect every referenced column.
    referenced = set(columns)
    normalized = []
    for f in filters:
        if not isinstance(f, dict) or not isinstance(f.get("column"), str) or not f["column"]:
            return {"error": "Each filter needs a 'column', e.g. {\"column\": \"wd_mm\", \"op\": \">=\", \"value\": 100}."}
        op = str(f.get("op") or "=").upper()
        if op not in ALLOWED_OPS:
            return {"error": f"Unsupported operator '{f.get('op')}'. Allowed: {sorted(ALLOWED_OPS)}"}
        normalized.append({**f, "op": op})
        referenced.add(f["column"])
    filters = normalized
    if sort and sort.get("column"):
        referenced.add(sort["column"])
    if referenced & HIDDEN_COLUMNS:
        return {"error": "Prices are not available from this catalog. Refer customers to https://www.etplautomation.com/contact.html."}

    # Candidate tables = those in scope that have ALL referenced columns.
    candidates = [t for t in scope_tables if referenced <= set(indexes.SCHEMA_REGISTRY[t])]
    if not candidates:
        return {"error": f"No table in scope has all of: {sorted(referenced)}"}

    # Build the single-table query on a representative table.
    where = ""
    clauses = []
    for f in filters:
        col, op = f["column"], f["op"]
        if op in ("IS NULL", "IS NOT NULL"):
            clauses.append(f"{col} {op}")
        else:
            clauses.append(f"{col} {op} {_lit(f.get('value'))}")
    if clauses:
        where = " WHERE " + " AND ".join(clauses)

    order = ""
    if sort and sort.get("column"):
        direction = "DESC" if str(sort.get("direction", "asc")).lower() in ("desc", "descending") else "ASC"
        order = f" ORDER BY {sort['column']} {direction}"

    lim = _clamp_limit(limit)
    rep = candidates[0]
    single = f"SELECT {', '.join(columns)} FROM {rep}{where}{order} LIMIT {lim};"

    sql = single if len(candidates) == 1 else expand_to_tables(single, candidates, indexes.SCHEMA_REGISTRY)
    result = _run(sql)
    result["sql"] = sql
    result["tables_searched"] = candidates
    return result


# ── find_extreme ────────────────────────────────────────────────────────────────

def find_extreme(metric: str, scope: str = "all", direction: str = "min", limit=1) -> dict:
    """Superlative lookup (e.g. cheapest/heaviest) over all tables, a family, or one
    table — combined with UNION ALL across every table that has `metric`."""
    if not indexes.column_exists(metric):
        return {"error": f"Unknown column '{metric}'. Use describe_table() to find spec columns."}

    if scope in (None, "all", ""):
        candidates = indexes.tables_with(metric)
    elif indexes.is_table(scope):
        candidates = [scope] if metric in indexes.SCHEMA_REGISTRY[scope] else []
    else:  # treat as a family name
        candidates = [t for t in indexes.tables_in_family(scope)
                      if metric in indexes.SCHEMA_REGISTRY[t]]

    if not candidates:
        return {"error": f"No table in scope '{scope}' has column '{metric}'."}

    order = "DESC" if str(direction).lower() in ("max", "desc", "highest", "most") else "ASC"
    lim = _clamp_limit(limit)
    rep = candidates[0]
    single = (f"SELECT model_name, {metric} FROM {rep} "
              f"WHERE {metric} IS NOT NULL ORDER BY {metric} {order} LIMIT {lim};")
    sql = single if len(candidates) == 1 else expand_to_tables(single, candidates, indexes.SCHEMA_REGISTRY)
    result = _run(sql)
    result["sql"] = sql
    result["tables_searched"] = candidates
    return result


# ── get_product ─────────────────────────────────────────────────────────────────

def get_product(model_name: str) -> dict:
    """Full specification row(s) for a specific model name."""
    found = indexes.find_model(model_name)
    if not found["matches"]:
        return {"model": model_name, "results": [],
                "suggestions": found.get("suggestions", [])}
    results = []
    for entry in found["matches"]:
        sql = f"SELECT * FROM {entry['table']} WHERE model_name = {_lit(entry['model_name'])};"
        res = _run(sql)
        results.append({
            "table": entry["table"],
            "family": entry["product_type"],
            "row": res.get("rows", [None])[0] if res.get("rows") else None,
            "error": res.get("error"),
        })
    payload = {"model": model_name, "results": results}
    errors = [entry["error"] for entry in results if entry.get("error")]
    if errors:
        # Keep per-table results (including any successful rows), but surface
        # failures at the top level so the MCP adapter sets isError correctly.
        payload["error"] = "; ".join(dict.fromkeys(errors))
    return payload


# ── run_select (validated escape hatch) ──────────────────────────────────────────

def run_select(sql: str) -> dict:
    """Validate a client-written SELECT (read-only + table/column grounding) and run it."""
    vr = _validator.validate(sql)
    if not vr.is_valid:
        return {"error": vr.reason, "sql": sql}
    result = _run(sql)
    result["sql"] = sql
    return result
